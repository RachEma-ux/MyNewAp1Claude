# Agent Studio — Canvas → Graph Projection Events ADR

**Status:** Accepted (2026-05-14). V1+ scope per `docs/implementation/agent-studio-native-graph-workspace-v1-v2-execution-plan.md` Phase 17.

**Decision owners:** Planner (this doc) → Builder → Reviewer → Tester → Governance per AGENTS.md.

---

## Context

PR-V1-10 (#761, Phase 17-β) shipped `buildCanvasReferenceProjection` + the `CANVAS_REFERENCES_NOTE` projection edge and added the `canvas.note_reference_changed` / `canvas.note_reference_removed` event kinds to the `ProjectionSyncWorker` event union. The worker can *handle* canvas events; what's missing is the **caller→worker glue**:

1. No caller in `server/agent-studio/services/canvas/canvas-service.ts` emits canvas events.
2. The existing projection-events queue table (`agsRuntimeGraphEvents`) has `runtimeRunId: notNull` and is shape-bound to Graph Agent decision traces. Canvas events do not have a runtimeRunId.
3. There is no in-process event bus and no boot-installed worker singleton today. `ProjectionSyncWorker.handle(event)` is callable from anywhere but no one calls it for canvas.

---

## Decision

### Caller→worker pattern: **Sink registry + caller hook**

Mirrors the established **AS-2 default governance-gate registry** pattern (PR-V1-31 / #782). Specifically:

- `registerCanvasProjectionEventSink(sink)` / `getCanvasProjectionEventSink()` / `hasCanvasProjectionEventSink()` / `__resetForTests` — module-singleton sink registry under `server/agent-studio/services/canvas/projection-events-sink.ts`.
- `recordCanvasProjectionEvent(event)` — convenience entry-point the canvas-service mutations call; delegates to the registered sink. **Default sink is a no-op** so installing this code does not change behavior on first install.
- Sink implementations land in follow-up PRs:
  - **In-memory sink** for testing.
  - **DB-backed sink** that writes to a new `ags_canvas_projection_events` table (separate from `agsRuntimeGraphEvents`; schema migration its own PR).
  - **Direct-worker sink** that pipes events through `ProjectionSyncWorker.handle()` synchronously (suitable for single-node deployments).

### Rejected alternatives

| Option | Why rejected |
|---|---|
| **Extend `agsRuntimeGraphEvents` with canvas event kinds** | The table's `runtimeRunId: notNull` constraint would force synthetic IDs for canvas events. Schema is shape-bound to Graph Agent decision traces; not a clean fit. |
| **Boot-installed `ProjectionSyncWorker` singleton + direct `worker.handle()` from canvas-service** | Tight coupling between the canvas service and the worker; harder to test; no place to queue if the worker is unavailable. |
| **In-process EventEmitter / Node `events`** | Process-local only; lost on restart. The whole point of a queue-backed worker is durability across restarts. |
| **tRPC-triggered worker** | The trigger is the same shape as direct invocation; just adds a network hop with no operational benefit. |
| **Cron / scheduler reading canvas changes directly** | Poll-based; misses events between polls; duplicates work the queue model already solves. |

### Why this preserves existing repo patterns

- **No hidden singleton.** The sink registry IS a singleton in the same shape as `default-governance-gate.ts` (AS-2). The codebase already accepts this pattern at the boundary between caller-side hooks and DI-injected sinks.
- **Postgres = source of truth.** The DB-backed sink (follow-up PR) persists to its own table; canvas state on `agsCanvasNodes` is unchanged; the worker re-projects from Postgres.
- **No direct DB coupling from UI.** Canvas-service is server-side. UI calls go through tRPC → canvas-service → `recordCanvasProjectionEvent`.
- **No bypass.** Graph mutations still go through the `ProjectionSyncWorker.handle(event)` → `GraphRepository.applyProjectionJob(writes)` path. This ADR adds the caller→worker glue; it does not add a parallel mutation surface.

### Acceptance criteria for the **first slice** (this PR)

- [x] ADR exists and is specific enough for implementation.
- [x] `CanvasProjectionEventSink` interface defined; closed event-shape union; sink registry implemented.
- [x] `recordCanvasProjectionEvent(event)` entry-point delegates to the registered sink; default sink is no-op.
- [x] `createCanvasNode` invokes `recordCanvasProjectionEvent` when `referencedNoteId != null` (the changed-event case). `referencedNoteId == null` → no event (no-op).
- [x] Source-scan boundary tests: canvas-service does not import `ProjectionSyncWorker` directly; `projection-events-sink.ts` is hard-rule clean.
- [x] Unit tests: registry semantics + recorder no-op-default + caller-side hook + dispatch round-trip with a fake sink.
- [x] No schema migration (deferred to the persistence-sink follow-up).
- [x] No behavior change on first install: default no-op sink preserves existing canvas-service behavior bit-for-bit.

### First implementation PR scope

| File | Purpose |
|---|---|
| `docs/architecture/agent-studio-canvas-projection-events.md` | This ADR |
| `server/agent-studio/services/canvas/projection-events-sink.ts` | Sink registry + `recordCanvasProjectionEvent` |
| `server/agent-studio/services/canvas/canvas-service.ts` | `createCanvasNode` calls `recordCanvasProjectionEvent` when `referencedNoteId != null` |
| `server/agent-studio/services/canvas/public-api.ts` | Re-export the 4 sink-registry names |
| `tests/agent-studio/canvas-projection-events-sink.test.ts` | Registry + recorder + caller-side hook tests |
| Ledger / progress tracker / continuation-state | Update |

### Out of scope (named follow-ups, each its own PR)

- **Persistence sink** — DB-backed sink + `ags_canvas_projection_events` schema migration.
- **Drain wiring** — boot step that connects the sink → `ProjectionSyncWorker.handle()`.
- **Update / delete caller-side hooks** — currently canvas-service has no `updateCanvasNode` / `deleteCanvasNode`; once they exist they call `recordCanvasProjectionEvent({ kind: "canvas.note_reference_removed", payload })`.
- **Cross-region propagation** — if the worker lives in a different region than the canvas write, MR-2's region-routed connection helper bridges (out of scope for this slice).

### Rollback / disable

No env flag needed. Default sink is a no-op — uninstalling means removing the registration call. Production runs in default-no-op mode until a real sink is registered at boot.

---

## References

- `docs/implementation/agent-studio-native-graph-workspace-v1-v2-execution-plan.md` Phase 17
- `server/agent-studio/services/graph/projection/sync-worker.ts` — `ProjectionSyncWorker` + event taxonomy incl. canvas kinds
- `server/agent-studio/services/canvas/projection.ts` — `buildCanvasReferenceProjection`
- `server/agent-studio/services/canvas/canvas-service.ts` — `createCanvasNode` (the first caller-side hook)
- `server/agent-studio/services/publish-targets/default-governance-gate.ts` — AS-2 sink-registry precedent
