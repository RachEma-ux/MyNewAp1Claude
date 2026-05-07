# Phase 33 — Execution Plan

**Captured:** 2026-05-07 against `main@002c34c` (post-Phase-32 closure).
**Branch (this doc):** `docs/pmb-phase-33-0-execution-plan`.
**Owner:** Planner role per AGENTS.md; full autonomous-execution authority granted by user 2026-05-07 (Option B — chat-binding tool-loop test repair).

---

## 1. Why Phase 33 exists

Phase 28 deferred 2 failing tests in `server/agent-studio/services/chat-binding.test.ts` as a §B-followup. Phase 30.4 brought 7 PMB unit-test files into CI but explicitly excluded `chat-binding.test.ts` because of those 2 failures. They've been carrying unattended for several phases.

Pre-flight investigation (in this PR) found the root cause is **not** a bug in the chat code — it's a stale test mock. The 2 failing tests assert the chat-loop dispatches a tool call through the MCP dispatcher. After D-TOOL-1 (the 8-class `riskClass` taxonomy locked at `services/cag/risk-classifier.ts:48`) landed its default-deny posture, any tool that doesn't carry an explicit `riskClass` annotation is quarantined by the validator. The test's mock tool:

```ts
mockedSnapshot.mockReturnValue({
  tools: [
    {
      name: "echo",
      description: "echoes args",
      inputSchema: { type: "object", properties: {} },
    },
  ],
});
```

…has no `riskClass`, so `readRiskClass` returns `"quarantined"`, the validator emits `quarantined_tool`, and the dispatcher is never reached. Both failing tests share this mock; both fail for the same reason.

The fix is a 1-line change per test (add `riskClass: "read_only"`). Once green, `chat-binding.test.ts` joins the existing PMB-unit-test CI shard so any future regression is caught at PR time.

Phase 33 is **NOT** a broad `server/**` test sweep. The repo has 147 `server/**` test files; bringing them all into CI is out of scope (per Phase 30.4's explicit narrowing) and most aren't PMB-relevant. Phase 33 only adds `chat-binding.test.ts` because (a) it's the test originally deferred and (b) it directly exercises the gateway-call routing PMB cares about.

---

## 2. Investigation findings (pre-flight, in this PR)

Running `npx vitest run server/agent-studio/services/chat-binding.test.ts`:

```
Test Files  1 failed (1)
     Tests  2 failed | 5 passed (7)
```

The 2 failures both expect `mockedDispatch` to be called once; both see 0 calls. Patching the test to dump `repo.appendChatMessage.mock.calls` reveals the actual rejection:

```
{
  "role": "tool",
  "content": "{\"error\":\"tool echo is quarantined (D-TOOL-1 default-deny)\",\"code\":\"quarantined_tool\",\"reason\":\"validator_rejected\",\"approvalRequestId\":null,\"gate\":\"proposed_tool_call_validator\"}"
}
```

Validator path: `chat.ts:423` → `validateRuntimeToolCall` → `readRiskClass(tool)` → returns `"quarantined"` because the mock tool has no `riskClass` field → `validateProposedToolCall` rejects with `quarantined_tool` → `gateRuntimeDispatch` returns `{ok: false, reason: "validator_rejected"}` → chat loop writes the error message and `continue`s to next tool call (none) → loop exits without ever reaching `dispatchMcpToolCall`.

The fix preserves the test's semantic intent (tool-loop dispatches a tool when validation passes) and aligns the mock with how real MCP tools self-declare per the D-TOOL-1 spec.

---

## 3. Sub-phase decomposition

### 33.0 — Plan freeze (this PR)

- [ ] Land `PHASE_33_EXECUTION_PLAN.md` (this doc).
- [ ] Memory: create `project_phase_33_authority.md`; `MEMORY.md` index update.
- [ ] **Acceptance:** doc lands; CI 5/5 green.

### 33.1 — Fix the 2 failing tests + add `chat-binding.test.ts` to CI

- [ ] **33.1a — Test fix.** Add `riskClass: "read_only"` to the mock tool in the `describe("sendChatMessage — tool-call binding path (Phase 18)")` block's `beforeEach`. The change is a single line per test file (one location, since both failing tests share the same `beforeEach`).
- [ ] **33.1b — Verify locally.** `npx vitest run server/agent-studio/services/chat-binding.test.ts --pool=forks --poolOptions.forks.singleFork` → expect 7/7 pass.
- [ ] **33.1c — CI inclusion.** Add `server/agent-studio/services/chat-binding.test.ts` to the "Layer 5: PMB unit tests" step in `.github/workflows/run-tests.yml` (currently 7 files; this brings it to 8).
- [ ] **Acceptance:** chat-binding tests pass; CI 5/5 green; the new file shows up in the Layer 5 step's verbose output.
- [ ] **Estimate:** 1 PR, ~5 LOC code + ~5 LOC CI.
- [ ] **Pause if:** the test passes locally but fails on CI for unrelated reasons (e.g., CI environment differences). Diagnose before continuing.

### 33.2 — Closure report

- [ ] Author `docs/evidence/provider-model-binding/PHASE_33_CLOSURE_REPORT.md` mirroring `PHASE_32_CLOSURE_REPORT.md`.
- [ ] Update memory: `project_phase_33_authority.md` → CLOSED; `project_pmb_phase_33_complete.md` created with PR ledger + carry-forward lessons; `MEMORY.md` index update.
- [ ] **Acceptance:** all 3 PRs merged; CI fingerprint stable.
- [ ] **Estimate:** 1 PR, ~150 LOC docs.

---

## 4. Decision matrix

Cap: **zero new TEMPORARY_EXCEPTION_WITH_DEADLINE entries.**

| # | Item | Decision | Sub-phase | Risk |
|---|---|---|---|---|
| 1 | Fix scope | Single `riskClass` addition to the test mock | 33.1a | Low — preserves test semantic intent; aligns with how real MCP tools self-declare |
| 2 | `riskClass` value | `"read_only"` | 33.1a | Low — `echo` is non-destructive; `read_only` matches the existing built-in classifier table for similar tools (`current_time`, `text_analysis`) |
| 3 | Broader server/** test sweep | **Out of scope** — only `chat-binding.test.ts` | 33.1c | N/A — explicit narrowing per Phase 30.4 |
| 4 | Carry the test as-is vs fix the validator | **Fix the test** — the validator is correctly enforcing D-TOOL-1; the test is what's stale | 33.1a | Low — the validator's behavior is the spec |

---

## 5. Test strategy

### Per sub-phase

- **33.0 (this):** docs only; CI green sufficient.
- **33.1 (fix):** `npx vitest run server/agent-studio/services/chat-binding.test.ts` locally must pass 7/7; CI's Layer 5 step then runs the same command against PRs going forward.
- **33.2 (closure):** docs only.

### Cross-cutting

- **CI fingerprint:** Phase 33 baseline is **5/5 green** at `002c34c`. The Layer 5 step gets 1 file added; expected to remain green.

---

## 6. Sizing

| Sub-phase | PRs | LOC code | LOC docs |
|---|---|---|---|
| 33.0 (this) | 1 | — | ~150 |
| 33.1 (fix + CI) | 1 | ~10 | — |
| 33.2 (closure report) | 1 | — | ~150 |
| **Total** | **3** | **~10** | **~300** |

Smallest PMB phase to date — even smaller than Phase 32 (which had -53 LOC).

---

## 7. CI fingerprint expectation

Phase 33 baseline is **5/5 green** as of `002c34c`. No matrix-shape changes; only +1 file in the Layer 5 step.

---

## 8. Authority and pause conditions

**Authority:** full autonomous commit/push/merge for any PR scoped inside this plan, granted 2026-05-07 (Option B from end-of-Phase-32 framings).

**Pause and surface for sign-off if:**

1. Any sub-phase requires a *new* TEMPORARY_EXCEPTION_WITH_DEADLINE (cap: 0).
2. The test fix surfaces a real bug in chat.ts (not just a stale mock) — pause and decide whether the bug is in scope or warrants a separate issue.
3. CI environment difference between local-pass and CI-fail — pause to diagnose.
4. Pre-existing red CI on a sub-phase PR not on the known-flaky-shard list.
