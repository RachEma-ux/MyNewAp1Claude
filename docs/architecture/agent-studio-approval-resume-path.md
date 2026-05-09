# Agent Studio Approval Resume Path — ADR

**Owner:** Agent Studio module + Governance
**Phase:** Cycle-4 closure (post-retrofit)
**Status:** Adopted — drives C2-c4 implementation PR(s)
**Authority:** Locked design contract for resume-after-approval. Frames the smallest viable mechanism + the multi-process upgrade path.

---

## 1. Problem statement

Cycle-4 audit (`/sdcard/Download/APPROVAL_AUDIT_2026-05-09.md` §C2-c4) flagged the absence of any resume mechanism after an operator approves a pending tool call:

- `gateRuntimeDispatch()` returns `reason="approval_required"` or `reason="approval_pending"` when the gate finds no `agsPendingPermissionRequests` row, or finds one in `pending` status.
- `chat-stream.ts:442-481` persists a trace row, appends an error message to chat (so the LLM sees the failure), emits a `tool_end` SSE event, and `continue`s the loop to the next LLM turn.
- The LLM then receives the "approval required" error as a tool-call result, reacts to it, and the chat-stream eventually drains and ends the SSE.
- When the operator subsequently approves the request via `agentStudio.toolApprovals.decide`, **nothing happens** to the original chat session. The approval row flips to `status="allowed"` in the DB, but the chat-stream that submitted the original tool call has already terminated.
- The user must re-prompt the chat (ideally with the same intent) and hope the LLM re-attempts the same tool call. On re-attempt, the gate now finds the `allowed` row and dispatches.

This is operationally CRITICAL: the user-visible workflow is "ask agent to do X → agent says it needs approval → operator approves → ... nothing happens. The agent never finishes the task without manual re-prompting."

The repo already has SSE infrastructure (`chat-stream.ts` writes `text/event-stream` responses) and a separate session-status SSE endpoint at `server/_core/index.ts:1050+` that uses 2-second polling. There is **no** LISTEN/NOTIFY, no WebSocket, no message bus, no resume-token store.

---

## 2. Decisions

### D-RESUME-1 — In-process EventEmitter is the resume bus for MVP

A single in-process `EventEmitter` keyed by `approvalRequestId` is the resume bus. `decideApprovalRequest()` (`server/agent-studio/services/approval/approval-gate.ts`) emits an `"approval_decided"` event with `{approvalRequestId, status, expiresAt}` after the DB UPDATE succeeds (right after the `agsRuntimePolicyEvents` audit write). `chat-stream.ts` subscribes when it observes a verdict of `approval_required` or `approval_pending`, waits with a bounded timeout, and then re-evaluates the gate.

**Why not LISTEN/NOTIFY (postgres):**

- LISTEN/NOTIFY would survive process restart of subscribers but adds operational overhead (per-process LISTEN connection that must be re-established on disconnect).
- The MVP ops baseline is single-region single-process (per `agent-studio-multi-region.md` ADR §6); the failure mode "operator approves between subscriber's connect and disconnect" is the same in both architectures.
- LISTEN/NOTIFY also doesn't survive the "operator approves before any subscriber exists" race (NOTIFY is fire-and-forget). The DB-poll fallback (D-RESUME-3) handles that race the same way for both bus types.
- Upgrade path to LISTEN/NOTIFY is documented in §3 — the bus interface is intentionally swappable.

**Why not WebSocket:**

- The existing real-time surface is SSE. Adding WebSocket would diverge from the established pattern.
- The chat-stream client is already an SSE consumer. Resume happens server-side inside the same SSE response — the client doesn't need a new connection.

**Why not persisted resume token + cron worker:**

- Heavyweight: requires a new table for in-flight runtime contexts, a worker process, and a token-expiry policy.
- The user-facing UX (chat that keeps the connection alive while waiting) is more natural than "session ends, user gets a notification, user opens a new chat to continue."
- Document this as the future shape if multi-process becomes the baseline (D-RESUME-5).

### D-RESUME-2 — Bounded wait inside the chat-stream loop, not a new stream

The chat-stream's existing SSE response is the resume surface. When the gate returns `approval_required`/`approval_pending`:

1. Persist the trace row (existing behavior — keeps `agsToolCallTraces` accurate).
2. Emit a `tool_end` event with a NEW status field: `status="awaiting_approval"` (current code emits `ok: false, error: ...`; UI should distinguish "waiting" from "failed").
3. Subscribe to the bus for `approvalRequestId` with a bounded timeout (default 300 s = 5 min; configurable via `APPROVAL_RESUME_TIMEOUT_SEC` env var).
4. Race: `bus.waitFor(approvalRequestId, timeoutSec)` vs `setTimeout(timeoutSec)`.
5. On bus event with `status="allowed"`: re-call `evaluateApprovalGate()` (defensive — confirms the DB state matches the event), and on permit, dispatch the tool, persist the per-dispatch trace row, emit `tool_end` with the result, continue the LLM loop.
6. On bus event with `status="denied"` OR `status="timed_out"`: append the error to chat history, emit `tool_end` with the denial reason, continue the LLM loop.
7. On timeout (no event in `timeoutSec`): same as denial — append a timeout-specific error to chat history, emit `tool_end` with `error="approval_timeout"`, continue the LLM loop.

The LLM does NOT see the original "approval_required" message in chat history. The error appended to chat history is the FINAL state after the wait resolves. This avoids the LLM reacting to an interim "waiting" state and then being told "actually, here's the result." The chat history reflects the actual outcome only.

**Why bounded:** unbounded waits would tie up SSE connections indefinitely. 5 minutes balances "operator has reasonable time to react" against "browser/proxy SSE timeouts (typical: 60-300 s)". The env var lets ops tune per-environment.

**Why re-call the gate after the bus event:** the bus event is a *signal that something changed*, not the truth. The DB row is the truth. Re-calling the gate handles the edge case where two approvals on the same request fired (race), or the row was decided then expired between event emission and gate re-eval.

### D-RESUME-3 — DB-poll fallback for the "approve-before-subscribe" race

When `chat-stream.ts` observes `approval_pending` (not `approval_required`), the row already exists. There is a race: the operator could approve the row between the gate's lookup and the bus subscribe. To close this race:

After subscribing to the bus, immediately re-call `evaluateApprovalGate()` ONCE. If the verdict is now `permit`, skip the wait entirely and dispatch. If still `pending`, wait on the bus.

This is a single extra DB read on the resume path. It eliminates the race window without polling — the rest of the wait is event-driven.

For `approval_required` (row didn't exist before the gate's lookup), the race is wider: the row gets created by the gate, then the operator could approve before the chat-stream subscribes. Same fix applies: re-call the gate once after subscribe, before waiting.

### D-RESUME-4 — The bus is per-process; cross-process resume is via re-prompt

The in-process EventEmitter does not span processes. If chat-stream A on process P1 is waiting and the operator approves via `toolApprovals.decide` on process P2, the bus event fires only on P2. P1's wait will time out and the chat-stream will surface "approval_timeout" — even though the approval succeeded.

**This is acceptable for MVP because:**

- The ops baseline is single-process (single Express server).
- If the user encounters timeout, the row is already `allowed` in the DB. Re-prompting the chat will succeed on first attempt because the gate will return `permit`.
- The audit-log trail is preserved either way (decideApprovalRequest writes its `agsRuntimePolicyEvents` row regardless of which process subscribes).

The upgrade path to multi-process resume is D-RESUME-5.

### D-RESUME-5 — Multi-process upgrade path: postgres LISTEN/NOTIFY

When the ops baseline moves to multi-process (driven by the multi-region ADR's trigger conditions), swap the in-process EventEmitter for a LISTEN/NOTIFY shim:

1. Each process starts a long-lived LISTEN connection on channel `approval_decided` at boot.
2. `decideApprovalRequest()` issues `NOTIFY approval_decided '{...}'` after the DB UPDATE (in the same transaction, so the LISTEN subscriber sees a committed state).
3. The LISTEN subscriber dispatches the event to its in-process EventEmitter (same shape as today).

The bus interface stays the same: `bus.waitFor(approvalRequestId, timeoutSec) → Promise<{status, expiresAt}>`. Only the publish path adds the LISTEN/NOTIFY hop. Chat-stream code does not change.

This decision is documented but **not implemented in MVP** — it ships only when multi-process is the operational baseline.

### D-RESUME-6 — Trace + audit invariants are unchanged

The resume path adds NO new audit table, NO new trace shape, NO new approval row state. Existing invariants stay:

- `agsRuntimePolicyEvents` row from `decideApprovalRequest()` is the source of truth for the decision (D-APP-EXT-6).
- `agsToolCallTraces` row from `persistRuntimeToolCallTrace()` records the per-call outcome — gets one row per chat-stream tool-call attempt (existing behavior).
- The resume-after-approval dispatch generates a NEW trace row (the dispatch is a fresh attempt within the same `runtimeRunId` / sessionId).
- The "awaiting_approval" SSE event is informational only — not persisted.

If the cycle-4 H2-c4 closure adds env-flag enforcement at the MCP gate layer, the resume path inherits it: if `evaluateApprovalGate()` returns `denied` because of `RBAC_ENFORCE_COARSE` flipping, the resume path treats it as denial (per D-RESUME-2 step 6).

### D-RESUME-7 — Test surface: integration only, not unit

The resume path crosses three modules (chat-stream, approval-gate, runtime trace). Unit-testing each module in isolation misses the interaction. Cycle-4 closure ships:

1. One integration test in `tests/integration/agent-studio/approval-gate.integration.test.ts` (existing file): "resume after approval grant" — open a fake chat-stream session, trigger gate to return `approval_required`, await subscribe, decide via `decideApprovalRequest()`, assert the chat-stream resumes and dispatches the tool.
2. One unit test for the bus itself in `tests/agent-studio/approval-event-bus.test.ts`: subscribe → emit → verify wait resolves; subscribe → timeout → verify wait rejects; multiple subscribers on same key → verify all receive.

**No retrofit-acceptance.test.ts assertion** — the resume path is not a D-APP-EXT-N invariant; it's a behavioral flow.

---

## 3. Implementation plan (informational; locked per PR scope)

**PR 1 (this ADR):** docs-only.

**PR 2 (bus + decideApprovalRequest emit):**
- Add `server/agent-studio/services/runtime/approval-event-bus.ts` (in-process EventEmitter wrapper, ~50 LOC, factory function for testability).
- Modify `decideApprovalRequest()` to emit on the bus after the DB UPDATE.
- Add unit test `tests/agent-studio/approval-event-bus.test.ts`.

**PR 3 (chat-stream wait integration):**
- Modify `chat-stream.ts` to subscribe + wait + re-evaluate on `approval_required`/`approval_pending`.
- Add `APPROVAL_RESUME_TIMEOUT_SEC` env var with 300s default.
- Emit `tool_end` with `status="awaiting_approval"` while waiting.
- Add integration test in `approval-gate.integration.test.ts`.

**PR 4 (UI distinguish-pending state — out of scope for C2-c4 closure):**
- Cycle-4 M3-c4 (RetrofitPage real-time updates) closes the operator-side polling.
- The chat-side "awaiting_approval" rendering is a follow-up M-tier item (not currently in the audit findings — flag if/when it surfaces).

PRs 2 + 3 may bundle into a single PR if the diff stays under ~300 LOC; the ADR doesn't pre-commit either way.

---

## 4. Non-goals

- **Cross-process resume** — punted to D-RESUME-5.
- **Operator notifications** (push/email when approval queues up) — out of scope.
- **Multi-tab resume** (operator approves on tab A, chat continues on tab B with a different process) — falls under D-RESUME-4 / re-prompt acceptance.
- **Persistent resume tokens** that survive chat-stream timeout — punted; if user hits the 5-min timeout, re-prompt is the path.
- **Approval revocation mid-wait** — if the operator approves then revokes within the 5-min window, the resume picks up the latest state via D-RESUME-2 step 5's defensive re-eval.

---

## 5. Trigger conditions for revisit

Open this ADR for amendment if any fire:

- Multi-process / multi-region becomes the ops baseline → trigger D-RESUME-5 implementation.
- Browser/proxy SSE timeouts force `APPROVAL_RESUME_TIMEOUT_SEC` below 60 s → consider WebSocket migration or persisted resume.
- Operator-approves-too-late metric (timeouts that succeed in DB but failed in chat) exceeds 5% → consider widening default timeout or adding push notification.
- A new audit cycle finds approval-decided events being lost between processes → trigger D-RESUME-5 immediately.
