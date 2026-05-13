# Agent Studio — Offline / Local-First Mode ADR

**Status:** Draft (2026-05-13). V2.0 scope per `agent-studio-native-graph-workspace-v1-v2-execution-plan.md` Phase OL-1.
**Decision owner:** Planner agent; consult Reviewer + Governance + security stakeholders before promoting to "Accepted".

---

## Context

Vault editing requires connectivity today. The MVP 0–4 plan explicitly deferred offline-first to V2.0 (CLAUDE.md "Native Graph Workspace — Non-Build List": "Offline sync / local-first mode" listed as out of scope). This ADR pins the source-of-truth rules, conflict policy, graph behavior, and security model **before any implementation begins**, because offline mutations are a real leak surface that can silently bypass governance if implemented carelessly.

## Decision

### Source-of-truth model

| Layer | Role | Mode |
|---|---|---|
| **Server Postgres** | Canonical source of truth | Always |
| **Server Neo4j projection** | Derived; rebuilt from Postgres | Always |
| **Client-side IndexedDB cache** | Derived view of a workspace subset; read-fast, write-buffered | Offline + online |
| **Client-side write queue** | Holds offline mutations until reconnect | Offline only; drained on reconnect |

This is **the same source-of-truth invariant** as CLAUDE.md: server Postgres remains canonical. Offline cache + write queue are **derived/transient**. The user sees offline edits immediately, but the server only sees them after reconnect → governance enforcement → write to Postgres.

### Conflict policy

Per the V1+ plan, when CRDT (Phase CRDT) ships first, conflict resolution uses Yjs semantics on reconnect:

1. Offline edits accumulate as Yjs operations against the locally cached document.
2. On reconnect, Yjs syncs with the server room; concurrent server-side edits merge.
3. The Yjs save boundary writes the merged result to Postgres + `agsNoteVersions`.

Until CRDT ships (Phase CRDT lands before Phase OL-1 per the V1+ plan critical path), offline mode is **read-only with edit-stage**: the user can stage edits offline, but they are explicitly held in a `pending_offline` state until reconnect; on reconnect the user is shown a three-way merge UI between (last-known-server-version, local-edited-version, current-server-version). The user picks one.

### Graph projection behavior

The Neo4j projection is **stale until reconnect**. Offline-cached graph subsets are read-only.

| Operation | Offline | Online |
|---|---|---|
| Read a note | Local cache | Server |
| Read graph neighborhood | Local cache (stale OK; UI shows "offline" badge) | Server |
| Edit a note | Stage to local write queue | Normal save |
| Create a new edge / promote a note | **Denied** — must reconnect | Normal |
| Run Graph Agent / GraphRAG | **Denied** — requires live connection | Normal |

The deny-mutation rule for graph + agent operations is **load-bearing**: it prevents an offline-mode escape hatch around governance + provider credentials.

### Security model

| Threat | Mitigation |
|---|---|
| Offline edit smuggles in policy-violating content | On reconnect, normal governance pipeline runs on every queued edit; if it fails, the edit is rejected and the user is notified |
| Offline write queue persists secrets | Write-queue payloads are scoped to the editing session and encrypted at rest in IndexedDB; secrets do not flow through the queue |
| Offline cache leaks across sessions | Cache is per-user; signed-out clears all offline state |
| Offline-mode operator skips approval | Operator-pending approval surfaces are not visible offline (the data isn't cached); approval can only happen online |
| Multi-device offline edits diverge | CRDT-aware merge (Phase CRDT) once both reconnect; UI three-way merge in pre-CRDT mode |

### What this ADR does NOT decide

- **Mobile-app shell** — out of scope; this is a web-shell offline mode.
- **Multi-region offline** — interacts with Phase MR-1; defer to that ADR.
- **Offline Graph Agent inference** — out of scope; explicitly denied.
- **Sync of all workspace data** — only the user's recently-viewed subset.

## Consequences

| Effect | Notes |
|---|---|
| New service-worker scaffold | `client/src/sw/offline-cache.ts` (new file) |
| New write-queue persistence | IndexedDB store; per-user; encrypted at rest with user-session-derived key |
| New offline indicator in UI | Header badge + per-note "stale" markers |
| New reconnect handshake | `services/vault/router.ts` adds a `replayQueuedWrites()` procedure; runs queued writes through normal write paths + governance |
| No mutation paths bypass governance | Hard rule. Source-scan tested. |

## First implementation PR

Per the V1+ plan Phase OL-1:

- `docs/architecture/agent-studio-offline-local-first.md` (this ADR, current PR creates it as Draft)
- `client/src/modules/agent-studio/services/offline-cache.ts` (TypeScript types + IndexedDB contracts; no service worker yet)
- Source-scan test: `tests/agent-studio/offline-cache-boundary.test.ts` — no graph-mutation surface importable from `offline-cache`; no `dispatchMcpToolCall` reference

Service-worker wiring is a separate PR after the type contracts ship.

## Rollback

If offline-first proves a net negative (security pressure, UI complexity, support load):
1. Remove the service-worker registration at `client/src/_core/bootstrap.ts`.
2. Clear all IndexedDB stores on next sign-in (one-shot migration).
3. UI reverts to online-only edit.

Postgres source-of-truth is unaffected — no server migration needed.

## Reference

- V1+ execution plan: `docs/implementation/agent-studio-native-graph-workspace-v1-v2-execution-plan.md` Phase OL-1
- CRDT ADR: `docs/architecture/agent-studio-realtime-collab-crdt.md`
- Predecessor closure: `docs/implementation/agent-studio-native-graph-workspace-status-check-2026-05-13.md`
