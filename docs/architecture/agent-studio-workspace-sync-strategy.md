# Agent Studio — Workspace Sync Strategy

**Status:** Adopted 2026-05-11
**Phase:** Native Graph Workspace Phase 19
**Owner:** Native Graph Workspace working group

---

## Summary

The Native Graph Workspace is **server-first** for MVP. Postgres
(ASDB) is the source of truth for vault content, decision traces,
graph skill packs, runtime usage, and CAG block source-note
references. Neo4j is a **projection** of Postgres; it never
holds state Postgres doesn't.

Real-time collaboration (CRDT/OT) and full offline mode are
**deferred** beyond MVP. The trigger conditions for un-deferring
are documented at the end of this ADR.

---

## What server-first means concretely

1. **One canonical row per note.** A note's contents live in
   `ags_vault_notes` + `ags_vault_note_versions`. There is no
   client-side mirror that diverges.
2. **Soft locks for concurrent editors.** The Phase 5 soft-lock
   layer (`ags_vault_note_edit_sessions`, `ags_vault_note_locks`)
   prevents two operators from clobbering each other's content
   in the same note version. Last-write wins is *not* the
   semantics; an editor whose lock expired refreshes content
   from the server before resuming.
3. **Optimistic-lock conflict detection.** Updates carry an
   `expectedVersion`; mismatched versions land in
   `ags_vault_note_conflicts` and the UI surfaces a merge prompt.
4. **No client-side rebase.** When a conflict fires, the client
   loads the current server version, the user resolves manually,
   and a new note version writes server-side. The client never
   "fast-forwards" or "rebases" the server.
5. **Neo4j projection rebuilds from Postgres.** A projection
   worker reads Postgres rows and writes Neo4j; the reverse
   direction is denied at the GraphRepository boundary except
   for ADR-approved bidirectional flows (Phase 11.5 graph change
   proposals).

This shape rules out CRDTs, OT, and local-first storage by design
— not as a "we'll do it later" promise, but as the *current
correctness model*.

---

## Multi-user editing today

Two operators editing the same note experience the following
sequence:

1. Operator A opens the note → soft lock acquired (TTL: 5
   minutes).
2. Operator B opens the same note → reads the current version;
   the UI shows "editing locked by A" (lock visibility, not
   prevention).
3. Operator A saves → `currentVersionId` advances; A's lock
   releases.
4. Operator B saves with the now-stale `expectedVersion` →
   conflict row writes; UI surfaces the merge prompt; B resolves
   and saves a v3 row.

The "two operators editing concurrently" case is supported, but
the resolution path is manual. There is no automatic merge.

---

## Hybrid import/export path

The publish/export side has its own ADR. From the sync side, the
hybrid path means:

- **Import** = `agentStudio.vault.importNoteFromMarkdown` (Phase
  15). Operators paste a Markdown blob (with or without YAML
  frontmatter) and it lands as a new vault note via the standard
  write path — same governance, same soft-lock layer, same
  optimistic-lock conflict detection.
- **Export** = `agentStudio.vault.exportNote` (Phase 15). The
  current version exports as a self-describing `.md` blob.
- **Bulk import/export** = vault-folder shape (deferred — see the
  publish-export ADR).

Round-trips are deterministic: `parseMarkdownBlob(renderNoteAsMarkdown(x))`
preserves the content + frontmatter for the common scalar / array /
object shapes, with `null` intentionally dropped.

---

## Why real-time collaboration is deferred

1. **CRDT cost surface.** A real CRDT (Yjs, Automerge) requires a
   server-side participant, conflict-free state in the schema,
   and per-user awareness state. Today's `ags_vault_notes` rows
   are linear-version, not CRDT-state.
2. **Multi-surface cost multiplier.** Real-time editing touches
   vault notes, the decision-trace ledger, graph change
   proposals, CAG blocks, and Cypher templates. Adding CRDT to
   one surface and not the others creates a fractured editing
   model.
3. **Governance & approval are sequential.** Approval gates
   (`requireGovernedAction`) are inherently linear — two
   operators cannot concurrently "half-approve" a destructive
   action.
4. **Soft locks cover the operator hot path.** A real workspace
   has 1-10 concurrent editors per note, not 100. Soft locks +
   conflict-merge prompts cover that traffic shape.

Trigger conditions for un-deferring (CRDT or OT):
- ✅ Vault rows have stable, schema-versioned shapes (Phase 20
  benchmarks pass on a production vault).
- ✅ Approval lifecycle is well-understood enough to expose a
  "request shared approval" surface.
- ✅ Multi-surface CRDT cost is budgeted (one phase per surface,
  not all at once).
- ✅ A small-scale CRDT spike (100 lines of code, one surface)
  passes a latency-vs-server-first comparison.

When 3 of 4 conditions hold, open the RFC.

---

## Why offline sync is deferred

1. **Authoritative state.** Server-first means the server has the
   answer. Offline operation requires either client-authoritative
   resolution (rejects "server first") or a CRDT (see above).
2. **Permission model.** Vault membership + workspace scope are
   evaluated server-side on every write. Offline writes would
   need a client-side permission cache + post-sync revalidation
   — a category of subtle bug we're not equipped to mitigate.
3. **Approval gate.** Approval requests live on the server with
   audit columns. Offline approval requests would need a "queue
   locally, replay on reconnect" path that the governance layer
   doesn't support today.
4. **Graph projection.** Neo4j projection runs server-side
   against the current Postgres rows. An offline editor that
   produced rows the projection hasn't seen yet would diverge the
   two backends.

Trigger conditions for un-deferring (offline-first):
- ✅ Real-time collaboration ships and stabilizes (offline is a
  generalization of CRDT, not a parallel feature).
- ✅ A signed-tx model exists for operator-issued writes (so
  replayed offline writes don't escape the approval gate).
- ✅ Per-vault snapshot export is reliable (so the local cache
  has a known starting state).

---

## Neo4j projection rebuild strategy

The projection layer is **idempotent rebuild from Postgres**:

1. **Trigger** — a rebuild fires on (a) an operator-issued
   `projection.rebuild(vaultId | "all")` command, (b) on
   demand-detected drift (Phase 14.5 drift detection), or (c)
   after a Neo4j upgrade / migration.
2. **Shape** — the worker reads all relevant Postgres rows in
   topological order: vaults → notes → entities → wikilinks →
   backlinks → graph projections → decision traces. Each
   batch upserts Neo4j nodes by stable Postgres ID.
3. **Atomicity** — rebuilds run as a single Neo4j transaction
   per batch. A failure midway leaves Neo4j in the last
   successful batch's state, not a half-rebuilt state.
4. **Read traffic during rebuild** — the projection writes a
   "stale" marker in `ags_graph_projection_sync_jobs` while a
   rebuild is in flight; the GraphRepository serves reads from
   the previous projection generation until the rebuild
   completes.
5. **Verification** — after rebuild, a checksum job compares
   Postgres row counts with Neo4j node counts (per label). A
   mismatch flips the projection back to "stale" and triggers a
   retry.
6. **Upgrade path** — Neo4j CE → Aura migration is in-place
   (Phase 27 ADR). The rebuild semantics don't change.

Source-of-truth invariant: **a corrupted Neo4j projection is
always recoverable by re-reading Postgres.** A corrupted Postgres
row is *not* recoverable from Neo4j — backup discipline lives on
the Postgres side.

---

## Acceptance criteria mapping

This ADR closes 5 of the 7 Phase 19 acceptance criteria. The
remaining 2 (Publish/export strategy documented; Hybrid
import/export path defined) live in the companion
`agent-studio-publish-export-strategy.md`.

- ✅ Sync strategy documented (this file)
- ✅ Server-first MVP confirmed
- ✅ Real-time collaboration deferred
- ✅ Offline sync deferred
- ✅ Neo4j projection rebuild strategy documented

---

## See also

- `docs/architecture/agent-studio-publish-export-strategy.md`
- `docs/architecture/agent-studio-canvas-strategy.md` — Phase 17
- `docs/architecture/agent-studio-extension-framework-strategy.md`
  — Phase 18
- `docs/implementation/agent-studio-native-graph-workspace-roadmap.md`
  Phase 19
