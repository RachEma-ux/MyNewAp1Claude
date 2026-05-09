/**
 * L5-c5 (cycle-5 audit `/sdcard/Download/MCP_DISPATCHER_AUDIT_2026-05-09.md`
 * §L5-c5) — dispatcher-side intentional-absence lockstep tests.
 *
 * Mirrors the cycle-4 `approval-gate.ts` 5-absence pattern (H1-c4 +
 * H2-c4 + H3-c4 + L1-c4 + M4-c4). The dispatcher's file header doc-
 * block declares 5 intentional absences; this test enforces them via
 * source-scan so a future PR cannot silently violate the boundaries.
 *
 * The 5 absences (locked here):
 *
 *   1. Dispatcher does NOT import from `services/approval/`
 *   2. Dispatcher does NOT reference approval-gate decision functions
 *   3. Dispatcher does NOT bypass governance hooks
 *   4. Dispatcher's sandbox routing is the only branch on riskClass
 *      "code_execution" (no parallel "if code_execution then direct"
 *      false-bypass)
 *   5. Dispatcher does NOT silently skip audit when runtimeRunId is
 *      provided (paired with `dispatcher-audit-coverage.test.ts`
 *      C1-c5 lockstep)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const DISPATCHER_PATH = join(
  process.cwd(),
  "server/agent-studio/services/mcp/dispatcher.ts",
);

function strippedSource(): string {
  // Strip block comments + line comments so doc-block mentions don't
  // false-positive on code-level assertions.
  return readFileSync(DISPATCHER_PATH, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

describe("L5-c5 — dispatcher intentional-absence lockstep", () => {
  it("dispatcher.ts does NOT import from services/approval/ (absence #1)", () => {
    const src = strippedSource();
    expect(
      src,
      "L5-c5 absence #1 violated: dispatcher imports from services/approval/. " +
        "Approval gating happens BEFORE dispatch (in gateRuntimeDispatch). " +
        "If you need to consult an approval row, accept it as input via " +
        "DispatchMcpToolCallInput, do NOT import approval-gate directly.",
    ).not.toMatch(/from ["'][^"']*services\/approval/);
  });

  it("dispatcher.ts does NOT reference approval-gate decision functions (absence #2)", () => {
    const src = strippedSource();
    // The forbidden symbols are the approval-gate's exported decision
    // functions. `evaluateMcpPreInvoke` / `evaluateMcpPostInvoke` are
    // governance-adapter, not approval-gate — those ARE allowed.
    for (const symbol of [
      "evaluateApprovalGate",
      "decideApprovalRequest",
      "createApprovalRequest",
    ]) {
      expect(
        src,
        `L5-c5 absence #2 violated: dispatcher references ${symbol}. ` +
          `Approval-gate decision functions belong to the runtime layer ` +
          `(proposed-tool-call-runtime.ts), not the dispatcher.`,
      ).not.toMatch(new RegExp(`\\b${symbol}\\b`));
    }
  });

  it("dispatcher.ts always invokes evaluateMcpPreInvoke (absence #3 — no governance bypass)", () => {
    const src = strippedSource();
    expect(
      src,
      "L5-c5 absence #3 violated: dispatcher does not call evaluateMcpPreInvoke. " +
        "Every dispatch path must run pre-invoke governance (system calls " +
        "still call it; it returns 'allow' for agentDraftId=-1 by design).",
    ).toMatch(/evaluateMcpPreInvoke\s*\(/);
  });

  it("dispatcher.ts contains exactly one `riskClass === \"code_execution\"` branch (absence #4)", () => {
    const src = strippedSource();
    const matches = src.match(
      /riskClass\s*===\s*["']code_execution["']/g,
    );
    expect(
      matches,
      "L5-c5 absence #4 violated: expected exactly one " +
        "`riskClass === \"code_execution\"` branch in dispatcher.ts " +
        "(the sandbox routing decision). Multiple branches risk a " +
        "false-bypass to direct transport. Got: " +
        (matches?.length ?? 0),
    ).toHaveLength(1);
  });

  it("dispatcher.ts only short-circuits audit on `runtimeRunId == null` (absence #5)", () => {
    const src = strippedSource();
    // The intentional ad-hoc skip is the `if (input.runtimeRunId == null)
    // return undefined;` line in writeAuditRow. There must be no OTHER
    // early-return that skips the audit insert.
    const adHocSkipPattern = /input\.runtimeRunId\s*==\s*null/;
    expect(
      src,
      "L5-c5 absence #5: the documented runtimeRunId-null skip must remain " +
        "(it's the ad-hoc operator-test path; C1-c5 closed the production gap " +
        "by threading runtimeRunId at chat-stream + chat.ts call sites).",
    ).toMatch(adHocSkipPattern);

    // Inverse guard: no `if (someOtherCondition) return undefined` shape
    // that bypasses appendRuntimePolicyEvent. Approximate via grep:
    // ensure the only `return undefined` in the audit helper section is
    // the documented one. The audit helper is delimited by the
    // `// ── Audit ──` comment block in the original source — but
    // we're operating on stripped source, so use the function name.
    const audit = src.split("async function writeAuditRow")[1] ?? "";
    const earlyReturns = audit.match(/return\s+undefined/g) ?? [];
    expect(
      earlyReturns,
      "L5-c5 absence #5 violated: writeAuditRow has more than one " +
        "`return undefined` early-skip path. The intentional skip is " +
        "the runtimeRunId == null guard; any additional skip silently " +
        "drops the audit row.",
    ).toHaveLength(1);
  });
});
