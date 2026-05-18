# Agent Studio — Vault Filesystem Sync ADR

**Status:** Draft (2026-05-18). Track A scope of the autonomous Obsidian-style vault initiative (`~/.claude/projects/-root/memory/project_obsidian_vault_authority.md`).
**Decision owner:** Planner agent; consult Reviewer + Governance + security stakeholders before promoting to "Accepted".

---

## Context

The vault is **fully DB-backed** today: `createNote` writes `contentMd` to `ags_note_versions.contentMd` (text column). Zero `fs.write*` calls exist in the vault service (`server/agent-studio/services/vault/**`). Notes only materialize as `.md` blobs at HTTP-download time via `exportNoteAsMarkdown`.

User-stated requirement (2026-05-18): "we want Obsidian-style 'vault is a directory of `.md` files on disk that syncs both ways'" + "we need it to be Opened and edited inside the app sameway as it is done in obsidian." Editing remains an in-app surface (the existing `MarkdownEditorPane`); disk `.md` files are a storage/portability layer, not an external editing surface.

This ADR pins the source-of-truth rules, conflict policy, sync directions, multi-region behavior, and security model **before any FS-sync implementation lands**, because filesystem mutations are a real exfiltration surface and a real conflict surface that can silently bypass governance or overwrite concurrent edits if implemented carelessly.

## Decision

### Source-of-truth model

Extends the offline-local-first ADR's invariant (`docs/architecture/agent-studio-offline-local-first.md`). FS sync is a **third writeable projection** alongside the existing three layers:

| Layer | Role | Mode |
|---|---|---|
| **Server Postgres** | Canonical source of truth | Always |
| **Server Neo4j projection** | Derived; rebuilt from Postgres | Always |
| **Client-side IndexedDB cache** | Derived view of a workspace subset; read-fast, write-buffered | Offline + online |
| **Client-side write queue** | Holds offline mutations until reconnect | Offline only |
| **Server-side `.md` filesystem mirror** | Derived; writeable projection (this ADR) | Per-vault opt-in |

This preserves the existing invariant: server Postgres remains canonical. The FS mirror is **derived/transient**; it can be regenerated from Postgres at any time without data loss, and FS-originated mutations flow through the same governance + version-history path as any other write.

### Per-vault configuration

FS-sync is **opt-in per vault**, not workspace-global. A new column lives on `ags_vaults`:

| Column | Type | Default | Notes |
|---|---|---|---|
| `fs_sync_path` | `text` (nullable) | `null` | Absolute filesystem path the operator chose. `null` = sync disabled. |

A second column lives on `ags_notes` to support cycle prevention (see below):

| Column | Type | Default | Notes |
|---|---|---|---|
| `fs_sync_last_hash` | `text` (nullable) | `null` | SHA-256 of the contentMd most recently flushed to or read from disk for this note. Updated on every successful FS round-trip. |

### Sync directions

**DB → FS** (server-driven, debounced):
1. `createNote` / `updateNote` / `deleteNote` post-commit emits a `noteWritten { noteId, vaultId, change }` event.
2. FS-sync writer service looks up the vault's `fs_sync_path`. If `null`, skip.
3. Compute target path = `{fs_sync_path}/{folder hierarchy from ags_folders}/{note.slug}.md`. `mkdir -p` parent dirs.
4. Render via existing `renderNoteAsMarkdown(note)` (frontmatter via the markdown-profile contract + body).
5. **Atomic write**: write to `.{slug}.md.tmp` → `rename()` to `{slug}.md` (prevents the watcher seeing half-written files).
6. SHA-256 the content, store in `ags_notes.fs_sync_last_hash`.
7. Debounce per-note 2s — coalesces typing bursts (already coalesced once by B1 auto-save at 1.5s) into one disk write.

**FS → DB** (server-side chokidar watcher):
1. Watcher (per-vault chokidar instance) observes `{fs_sync_path}/**/*.md`. Debounce 1s per file.
2. On `add` / `change`: read file, SHA-256 it.
3. **Echo prevention**: if hash matches `ags_notes.fs_sync_last_hash` for the slug, this is our own write coming back — skip.
4. Otherwise: parse via existing `parseMarkdownBlob()`. If the slug matches an existing note: upsert as a new `ags_note_versions` row with `createdBy = "fs-sync"` author marker; if no match: create a new `ags_notes` row (slug from filename, frontmatter title applied, body becomes contentMd).
5. Update `fs_sync_last_hash` to the new hash.
6. On `unlink`: soft-delete the note row (existing `deleteNote` semantics; the `.md` deletion is treated as an operator-intent delete).
7. On rename: emit a `noteRenamed` event; existing note slug updates to the new filename (slug uniqueness constraint applies; conflicting renames raise the existing rename-conflict surface).

### Conflict policy

Reuses the offline-local-first ADR's resolution path (`agent-studio-offline-local-first.md` → "Conflict policy"):

1. **If a Yjs (CRDT) room is open for the note**, an FS-originating change is broadcast as a doc-update. The Yjs server-room merge resolves overlapping edits; the merged result lands in `ags_note_versions`. No special UI required — the in-app editor sees the merge inline.
2. **If no CRDT room is open** (no live editor session), FS→DB upsert proceeds directly. Any operator who opens the note afterward sees the merged contentMd in the editor.
3. **expected-version conflicts** (same kind the existing `updateNote` mutation surfaces) are returned to the FS writer as a no-op — the next watcher event will replay the freshest disk content.

This is intentionally the same policy as offline edits — the operator's mental model stays consistent: server is authoritative; clients (web, FS, offline cache) are all eventually-consistent projections.

### Cycle prevention

Without cycle prevention, every DB→FS write would trigger a chokidar event, which would trigger a FS→DB write, which would trigger another DB→FS write, etc. The mechanism is the `fs_sync_last_hash` column:

- After **any** successful FS round-trip (DB→FS write OR FS→DB read), the column stores the SHA-256 of the contentMd as it exists on disk.
- When chokidar fires and we hash the file: if hash equals `fs_sync_last_hash`, we generated this write — silently skip.
- When DB writes and we're about to flush: if hash of the to-be-written content equals `fs_sync_last_hash`, the disk is already up to date — silently skip.

The hash is also durable across process restarts (it lives in Postgres), so a server restart mid-sync doesn't create cycles.

### Multi-region

Per-region local mirror, **independent**. Cross-region FS replication is **not** in scope:

- Each region's writer/watcher reads its local Postgres replica and writes to its own local filesystem.
- The cross-region truth is Postgres replication itself (Phase MR-1) — the FS layer rides on top.
- An operator configures `fs_sync_path` per region (the column is replicated; effective behavior is region-local).
- Single-region deployments behave identically to today's expectation.

### Folder layout on disk

```
{fs_sync_path}/
├── _attachments/        ← binary files (Phase 2; this ADR ships .md only)
├── Project Notes/
│   ├── Q4 plan.md
│   └── Retrospective.md
├── Daily/
│   └── 2026-05-18.md
└── README.md            ← top-level note in the root folder
```

- One `.md` per note. Filename = `{slug}.md` (slug is already URL-safe per existing contract).
- Folder hierarchy mirrors `ags_folders` exactly. Folder rename = directory rename. Folder delete = `rmdir`; non-empty folders block the delete (operator must move/delete notes first).
- `_attachments/` is reserved for the binary-attachment sync Phase that ships **after** this ADR's MVP. The MVP ships `.md` only; attachments stay DB-backed.

### Frontmatter format

Reuses the existing markdown-profile (`docs/architecture/agent-studio-markdown-profile.md`) verbatim. `renderNoteAsMarkdown` and `parseMarkdownBlob` are the round-trip pair; no new format invention. The contract is summarized:

```markdown
---
title: Q4 Plan
slug: q4-plan
version: 12
governance: published
custom_property: arbitrary value
---

# Q4 Plan

Note body in standard CommonMark…
```

The `title` and `slug` keys are pulled into the note row; the rest of the YAML survives round-trip via `ags_notes.frontmatter` (jsonb).

### Security model

- **No symlink traversal.** The writer rejects any target path that escapes `fs_sync_path` after `realpath` resolution. The watcher rejects symlinks pointing outside the root.
- **No path injection.** Slugs are URL-safe by the existing CHECK constraint; filename derivation uses `sanitizeFilenameSegment` from `markdown-import-export.ts` (already in place; reused, not duplicated).
- **`fs_sync_path` must be operator-supplied and admin-gated.** The `setFsSyncPath` tRPC procedure (A5) requires admin role; the path is validated to be (a) absolute, (b) inside an allowed-root list (env-configured: `VAULT_FS_SYNC_ALLOWED_ROOTS`, comma-separated absolute paths), (c) writable by the server process. Missing env variable = feature disabled.
- **No path enumeration from the client.** The settings UI accepts a free-form string; the server validates server-side. The client never reads or lists the filesystem.
- **Per-process exclusive watcher.** Only one server process should run a watcher per `fs_sync_path` to avoid double-handling FS events; the writer/watcher module enforces a per-path advisory lock via a `.fs-sync.lock` sentinel file containing the watching process's PID.

### Initial backfill

When `fs_sync_path` is first set (or moved) on a vault:

1. The reconciler runs a one-shot full export: every existing note's latest version is rendered + written via the standard DB→FS path.
2. Folder hierarchy is created from `ags_folders`.
3. Progress is reported via `getFsSyncStatus` (notes-written / notes-total).
4. Backfill is idempotent — re-running against a populated folder updates files whose disk hash differs from `fs_sync_last_hash` and skips the rest.

A second `triggerInitialBackfill` tRPC procedure exists for operator-recovery (e.g., after a manual `rm -rf` of the disk folder).

## Non-goals (this ADR + the Track A 9-PR sequence)

- **Cross-region FS replication.** Each region maintains its own local mirror; cross-region sync is the existing Postgres-replication mechanism's job.
- **Binary attachments.** `_attachments/` directory is reserved but not populated; attachments stay DB-backed for MVP.
- **`.obsidian/` plugin compatibility.** This ADR ships a folder that Obsidian can *read* (the frontmatter profile matches), but does not ship Obsidian-plugin metadata files (workspaces.json, app.json, plugin folder structures). Plugin compat is a follow-on phase.
- **External editor as primary UX.** The on-disk `.md` is for portability/backup/sync. The in-app `MarkdownEditorPane` (with Track B Obsidian-parity enhancements) is the editing surface.
- **Real-time disk push to web clients.** Browser clients still see vault state via tRPC + Yjs; the disk layer is server-side.

## Consequences

| Effect | Notes |
|---|---|
| New service module | `server/agent-studio/services/vault/fs-sync/` — writer + reader + reconciler + watcher (A3 + A4) |
| New dependency | `chokidar` (A4) — production dep on `chokidar@^3` (or ^4 if compat verified) |
| Schema migration | `ags_vaults.fs_sync_path text nullable` + `ags_notes.fs_sync_last_hash text nullable` (A2) |
| Post-commit hook on vault mutations | `createNote` / `updateNote` / `deleteNote` emit `noteWritten` events (A6); FS-sync writer subscribes |
| New tRPC surface | `setFsSyncPath`, `getFsSyncStatus`, `triggerInitialBackfill` on vault router (A5) |
| New settings UI | `VaultFsSyncPanel` (A7) — admin-gated path input + status badge + backfill button |
| Boundary scan | `fs.write*` allowed only inside `services/vault/fs-sync/**` and existing operator-tool paths; source-scan-tested (A9) |
| Env contract | `VAULT_FS_SYNC_ALLOWED_ROOTS` (optional; absence disables the feature globally) |
| CLAUDE.md "Native Graph Workspace" update | New FS-sync entry under Hard rules (A9) |

## First implementation PR

This ADR (A1) ships first as a docs-only change. Subsequent PRs follow per the Track A sequence in `project_obsidian_vault_authority.md`:

- A2 — Schema migration (`fs_sync_path`, `fs_sync_last_hash`)
- A3 — FS sync module (writer + reader + reconciler; no watcher yet)
- A4 — Chokidar watcher integration
- A5 — tRPC procedures (setFsSyncPath, getFsSyncStatus, triggerInitialBackfill)
- A6 — createNote/updateNote/deleteNote post-commit DB→FS hooks
- A7 — Per-vault FS settings UI
- A8 — Initial backfill on first enable
- A9 — Boundary tests + CLAUDE.md update + closure

## Rollback

If FS-sync proves a net negative (security pressure, conflict-rate spikes, support load):
1. Unset `VAULT_FS_SYNC_ALLOWED_ROOTS` env globally — feature disables on next restart.
2. Set `fs_sync_path = null` on every affected vault (one-shot SQL).
3. Optionally `rm -rf` the materialized folder(s) — Postgres remains intact; no data loss.

Postgres source-of-truth is unaffected. No reverse migration needed; the two new columns can stay (nullable) or drop in a follow-up.

## Reference

- Predecessor invariant: `docs/architecture/agent-studio-offline-local-first.md`
- Multi-region context: `docs/architecture/agent-studio-multi-region.md`
- CRDT context: `docs/architecture/agent-studio-realtime-collab-crdt.md`
- Markdown round-trip contract: `docs/architecture/agent-studio-markdown-profile.md`
- Note metadata contract: `docs/architecture/agent-studio-note-metadata-domain-model.md`
- Track A execution plan: `~/.claude/projects/-root/memory/project_obsidian_vault_authority.md`
