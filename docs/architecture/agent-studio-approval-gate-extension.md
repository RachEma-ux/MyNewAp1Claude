# Agent Studio Approval Gate Extension — ADR

**Owner:** Agent Studio module + Governance
**Phase:** 1 (Retrofit ADRs)
**Status:** Adopted — drives Phase 9
**Authority:** Locked design contract for tool-dispatch approval. Reuses existing scaffolding; adds no new tables.

---

## 1. Problem statement

The retrofit prompt requires that high/critical-risk MCP tool calls be approved before dispatch. Specifically:

- A `ProposedToolCall` with `riskLevel ∈ {high, critical}` MUST create or reuse an approval request.
- A rejected approval MUST block dispatch.
- An expired approval MUST block dispatch.
- An approved approval MUST permit MCP validation (it does NOT execute the tool itself).
- Approval is auditable end-to-end.

The repo already has approval scaffolding:

- `agsApprovalSteps` — for publish/release approval flows.
- `agsPendingPermissionRequests` — for tool/permission gating, with status `pending|allowed|denied|timed_out`.
- `services/governance-adapter.ts` — `evaluateGovernance()` returns `{verdict, reasons, policySummary{...approvalRequired...}}`.

The risk is that a Phase 9 implementation could create a parallel `tool_approvals` table or bypass the existing governance adapter. This ADR locks the reuse contract.

---

## 2. Decisions

### D-APP-EXT-1 — Reuse `agsPendingPermissionRequests`; add no new approval table

`agsPendingPermissionRequests` already has the right shape:

- Foreign keys to draft + tool.
- `status` enum: `pending | allowed | denied | timed_out`.
- `requestedBy`, `decidedBy`, `decidedAt`, `expiresAt`.
- Free-form `requestPayloadJson` for the proposed-call snapshot.

Phase 9 extends this row with `proposedToolCallJson` (the full ProposedToolCall payload from Phase 8) and `proposedToolCallHash` (SHA-256 of the canonicalized payload). No new table.

### D-APP-EXT-2 — One approval per `(agentDraftId, proposedToolCallHash)` — idempotent on hash

When the dispatcher receives a high/critical ProposedToolCall:

1. Compute `proposedToolCallHash` (canonical JSON → SHA-256).
2. Look up existing row `(agentDraftId, proposedToolCallHash)`:
   - **Match with `status="allowed"` AND `expiresAt > now`** → permit; record `lastUsedAt`.
   - **Match with `status="allowed"` AND expired** → reject with reason `approval_expired`; do NOT auto-renew.
   - **Match with `status="denied"`** → reject with reason `approval_denied`.
   - **Match with `status="pending"`** → reject with reason `approval_pending` (the dispatcher does not block-wait on a human; it returns and the caller retries).
   - **No match** → create new row, status=`pending`, return `approval_required`.
3. The dispatcher NEVER executes the tool when it creates a `pending` row. It returns to the caller, which surfaces the approval request UI / notification.

The hash makes the gate idempotent: the same proposed call doesn't queue duplicates. Re-running the agent with identical evidence + arguments hits the existing approval row.

### D-APP-EXT-3 — Approval permits MCP validation; it does NOT execute

Approval is a pre-dispatch gate. After approval clears (`status="allowed"` AND not expired), the dispatcher:

1. Re-runs `evaluateMcpPreInvoke` (governance still evaluates per call).
2. Re-validates the tool against the live MCP registry (the registry is the source of truth; the approval row holds a snapshot).
3. Calls the MCP transport.
4. Re-runs `evaluateMcpPostInvoke`.

Approval does not invoke the transport directly. Approval does not bypass governance. Approval does not bypass MCP schema validation. The principle: approval is a *permission to attempt*, not a *promise to succeed*.

### D-APP-EXT-4 — Risk-level mapping is deterministic and locked

Phase 8 maps the 8-class `ToolRiskClass` taxonomy onto the 4-level `riskLevel`:

| `ToolRiskClass` | `ProposedToolCall.riskLevel` | Requires approval? |
|---|---|---|
| `read_only` | `low` | No |
| `write` | `medium` | No (degraded racStatus warns) |
| `external_side_effect` | `medium` | No |
| `governance_sensitive` | `medium` | Yes (always) |
| `credential_sensitive` | `high` | Yes |
| `code_execution` | `high` | Yes (sandbox AND approval) |
| `destructive` | `critical` | Yes |
| `quarantined` | `critical` | Hard-block (cannot approve) |

`requiresApproval` on the ProposedToolCall is derived from this table; the model cannot lower the level. Phase 8's validator rejects model output that claims `requiresApproval=false` for a tool whose risk class maps to `medium+governance_sensitive` or `high` or `critical`.

### D-APP-EXT-5 — Approval expiry default is 1 hour; per-tool override is allowed

Default `expiresAt = decidedAt + 1 hour`. The reasoning: short enough that an approver isn't carrying long-tail risk; long enough that an interactive agent run completes within one approval window.

Per-tool overrides land on the tool manifest as `approvalTtlSeconds` (Phase 7 mirror surfaces this). For destructive tools, the operator can shorten to 5 minutes. For ambient credential-sensitive tools (e.g., a Slack post in a known channel), the operator can extend to 8 hours. **No tool may set `approvalTtlSeconds = ∞`**: even multi-hour windows expire eventually so a stale approval doesn't haunt a future agent.

### D-APP-EXT-6 — Audit row per state transition

Each transition (`null → pending`, `pending → allowed`, `pending → denied`, `allowed → timed_out`, `pending → timed_out`) writes a row to the existing `agsRuntimePolicyEvents` ledger. The dispatcher's existing audit path already writes there for every tool call; Phase 9 adds the approval-state-transition events alongside.

This means a reviewer can read the same ledger to see the full lifecycle: ProposedToolCall created → approval pending → approval allowed → tool dispatched → tool returned. No separate audit log.

### D-APP-EXT-7 — Approval UI is a Phase 12 deliverable

The persistence + dispatcher gating land in Phase 9. The UI (approval queue, approve/reject/expire actions, audit history) lands in Phase 12 alongside the rest of the retrofit's UI work. Until Phase 12 ships, approvals can be created/decided via the tRPC mutation directly (`governance.toolApprovals.{create,approve,reject}` from Phase 11).

---

## 3. Consequences

- **No new approval table.** The retrofit reuses `agsPendingPermissionRequests`.
- **Idempotent on hash.** Re-running an agent with identical evidence + arguments doesn't create duplicate approvals.
- **Approval is layered with governance + MCP validation.** Three gates remain in place; approval doesn't bypass any.
- **Risk-level mapping is locked.** The model cannot game `requiresApproval`.
- **Default 1-hour expiry; per-tool override.** Short enough to bound risk; long enough for normal flows.
- **Audit is unified.** State transitions land in `agsRuntimePolicyEvents` alongside dispatch events.

---

## 4. Acceptance

- [x] Reuse `agsPendingPermissionRequests` (D-APP-EXT-1).
- [x] Idempotent on `(agentDraftId, proposedToolCallHash)` (D-APP-EXT-2).
- [x] Approval permits MCP validation; does not execute (D-APP-EXT-3).
- [x] Risk-level mapping locked (D-APP-EXT-4).
- [x] 1-hour default expiry; per-tool override (D-APP-EXT-5).
- [x] Audit per state transition in `agsRuntimePolicyEvents` (D-APP-EXT-6).
- [x] UI deferred to Phase 12 (D-APP-EXT-7).
- [ ] Schema extension (`proposedToolCallJson`, `proposedToolCallHash`, `lastUsedAt`) lands in Phase 2.
- [ ] Dispatcher gate + state machine land in Phase 9.
- [ ] tRPC mutations land in Phase 11.
- [ ] UI lands in Phase 12.
