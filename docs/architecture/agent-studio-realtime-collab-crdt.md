# Agent Studio — Real-Time Collaborative Editing (CRDT) ADR

**Status:** Draft (2026-05-13). V2.0 scope per `agent-studio-native-graph-workspace-v1-v2-execution-plan.md` Phase CRDT.
**Decision owner:** Planner agent; consult Reviewer + Governance before promoting to "Accepted".

---

## Context

Vault notes today use last-writer-wins; concurrent edits from two operators silently lose one operator's changes. The MVP 0–4 plan explicitly deferred CRDT support to V2.0 (CLAUDE.md "Native Graph Workspace — Non-Build List": "Real-time collaborative editing / CRDT" listed as out of scope). The V1+ successor execution plan brings it back as Phase CRDT.

This ADR pins the choice + boundaries for the CRDT layer **before any implementation begins**.

## Decision

### CRDT library choice

**Yjs** is the leading candidate.

| Criterion | Yjs | Automerge | Verdict |
|---|---|---|---|
| TS / browser ergonomics | First-class | First-class | Tie |
| Server-side scaling | Strong (y-protocols + y-leveldb / Redis adapter) | Moderate | Yjs |
| Memory footprint at 10k-edit history | ~MB-scale | ~10× larger | Yjs |
| React integration | y-react + y-tldraw maturity | Modest | Yjs |
| License | MIT | MIT | Tie |
| Existing repo familiarity | None | None | Tie |

Default: **Yjs**. Revisit if multi-region merging surfaces conflict semantics that need Automerge's stronger guarantees.

### Source-of-truth model

| Layer | Role |
|---|---|
| **Postgres `agsVaultNotes` + `agsNoteVersions`** | Canonical source of truth. Every save = new `agsNoteVersions` row. |
| **CRDT document (Yjs)** | Transient session-state layer for presence + cursor + uncommitted in-progress edits. Not authoritative. |
| **Backend WebSocket / SSE adapter** | Relays Yjs updates between connected clients; persists snapshots to Postgres at save boundary, not on every keystroke. |

This preserves CLAUDE.md's Postgres = source of truth invariant. The CRDT layer is a **derived presentation** that converges to Postgres at save time.

### Boundary table

| Boundary | Rule |
|---|---|
| Graph access | Unchanged — all graph reads/writes still go through `GraphRepository`. CRDT layer never imports `neo4j-driver` or graph-quality services. |
| MCP dispatcher | Unchanged — collaborative editing does not invoke tools. |
| OpenRouter | Unchanged. |
| Governance | Every CRDT save still creates a new `agsNoteVersions` row + runs through the existing `services/vault/repository-asdb.ts` write path. No collaborative-edit-specific bypass. |
| Approval | If a CRDT session edits a note that's under approval-hold, the hold semantics apply at save time (Postgres write boundary), exactly as for single-user edits. |
| Audit | Every save records the participating user IDs in `agsRuntimeRuns` so audit can reconstruct collaborator list. |

### Conflict policy

Yjs converges automatically at the CRDT layer (operational transform / CRDT semantics). At save time:

1. The Yjs document state is serialized to canonical markdown.
2. The result is compared against the last-committed `agsNoteVersions` row.
3. If different, a new version row is created. If identical, no-op.
4. The participating user IDs are recorded on the new version row.

There is no manual merge UI in the V2.0 first slice — Yjs's automatic merge is the contract. A future PR can add three-way diff visualization if operators ask for it.

### Network protocol

**WebSocket** over the existing dev-server. `services/vault/realtime-doc.ts` exposes a `/api/vault/realtime/:noteId` WebSocket endpoint:

- Authenticated via existing session cookies.
- Per-note rooms.
- Yjs `y-websocket` server protocol.
- Heartbeat + 30-second idle disconnect.

Falls back to SSE-only when WebSocket is blocked (corporate proxies).

### What this ADR does NOT decide

- **Offline-first** semantics — that's Phase OL-1 (sibling ADR).
- **Multi-region** collaborator sync — that's Phase MR-1.
- **CRDT for graph nodes/edges** — out of scope. The graph remains operator-edit-only via the existing Phase 11.5 proposal flow.
- **Multi-document transactions** — out of scope.

## Consequences

| Effect | Notes |
|---|---|
| New module `services/vault/realtime-doc.ts` + `services/vault/presence.ts` | Adds to Vault module manifest; no greenfield. |
| Frontend complexity | Yjs + React hooks; ~10 new components |
| Postgres write rate unchanged | CRDT debounces saves; one save per coalesced edit window, not per keystroke |
| New attack surface — WebSocket auth | Reuses session cookies; same TLS posture as existing tRPC |
| Memory cost on server | Per-note Yjs document held in-memory for active sessions; LRU-evicted on inactivity |

## First implementation PR

Per the V1+ plan Phase CRDT-α:

- `docs/architecture/agent-studio-realtime-collab-crdt.md` (this ADR, current PR creates it as Draft)
- `server/agent-studio/services/vault/presence.ts` — presence tracking, no Yjs yet
- Source-scan test: `tests/agent-studio/vault-presence-boundary.test.ts` — no concurrent-write bypass of `agsNoteVersions`

Full Yjs wiring is a separate PR after presence ships.

## Rollback

If Yjs proves unfit, fall back to:
1. Disable WebSocket endpoint at `services/vault/router.ts` (flag).
2. Frontend reverts to single-user edit UI.
3. Postgres source-of-truth is unaffected — no migration needed.

This is the load-bearing reason to keep Yjs as a derived layer rather than the source of truth.

## Reference

- V1+ execution plan: `docs/implementation/agent-studio-native-graph-workspace-v1-v2-execution-plan.md` Phase CRDT
- Predecessor closure: `docs/implementation/agent-studio-native-graph-workspace-status-check-2026-05-13.md`
- Yjs documentation: https://docs.yjs.dev
- Automerge documentation: https://automerge.org
