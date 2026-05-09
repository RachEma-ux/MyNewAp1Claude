/**
 * L1-c6 + L2-c6 (cycle-6 audit `/sdcard/Download/RUNTIME_GATE_AUDIT_2026-05-09.md`
 * §L1-c6, §L2-c6) — final closing-arc doc-bundle.
 *
 * Both items are doc-block-only closures on the approval-gate ↔
 * tool-approvals-router surface area. No source-code behavior
 * changes — the docs describe pre-existing correct behavior so
 * future readers + operators triaging support tickets understand
 * the edge cases.
 *
 * L1-c6 — revoke race window:
 *   The verdict from `evaluateApprovalGate` is a SNAPSHOT, not a
 *   CONTRACT. Between the gate's SELECT and the dispatcher's
 *   actual MCP invocation, the row can flip (operator decide,
 *   M3-c6 expiry sweep, expiresAt elapse). The dispatcher does
 *   NOT re-validate. Documented + lockstep-pinned.
 *
 * L2-c6 — nullable agentDraftId edge case:
 *   `agsPendingPermissionRequests.agentDraftId` is nullable
 *   (legacy rows pre-D-APP-EXT-2 carry NULL). The C2-c6
 *   `resolveApprovalOwner` join silently returns null on these
 *   rows → caller gets NOT_FOUND. Behavior is correct; the doc
 *   block tells operators triaging tickets how to distinguish
 *   the "legacy row needs backfill" case from "row doesn't exist."
 *
 * Mirrors the cycle-4 + cycle-5 + cycle-6 #348 doc-block + lockstep
 * pattern.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const APPROVAL_GATE_PATH = join(
  process.cwd(),
  "server/agent-studio/services/approval/approval-gate.ts",
);
const TOOL_APPROVALS_ROUTER_PATH = join(
  process.cwd(),
  "server/agent-studio/api/tool-approvals-router.ts",
);

describe("L1-c6 — evaluateApprovalGate revoke-race doc-block", () => {
  const src = readFileSync(APPROVAL_GATE_PATH, "utf8");

  it("source carries the L1-c6 closure marker", () => {
    expect(
      src,
      "L1-c6 violated: approval-gate.ts must carry the `L1-c6` " +
        "closure marker so a future audit can trace the " +
        "snapshot-not-contract documentation back to its origin.",
    ).toMatch(/L1-c6\b/);
  });

  it("doc-block names the SNAPSHOT-not-CONTRACT semantic", () => {
    // The load-bearing terminology — without the explicit
    // "snapshot" framing, future readers may assume the verdict
    // is durable and add brittle re-validation in the dispatcher.
    expect(
      src,
      "L1-c6 violated: the doc-block must explicitly name the " +
        "snapshot-not-contract semantic so future contributors " +
        "don't add brittle re-validation in the dispatcher.",
    ).toMatch(/SNAPSHOT[\s\S]{0,80}CONTRACT|snapshot[\s\S]{0,80}contract/i);
  });

  it("doc-block enumerates the three race vectors", () => {
    // The three known race vectors: operator decide (revoke),
    // M3-c6 expiry sweep, expiresAt elapse. A future PR that
    // drops one from the doc-block leaves it incomplete.
    expect(src).toMatch(/decideApprovalRequest[\s\S]{0,400}M3-c6[\s\S]{0,400}expiresAt/);
  });

  it("doc-block notes that the dispatcher does NOT re-validate", () => {
    // The dispatcher's no-re-validate policy is the LOAD-BEARING
    // detail. A future PR that adds re-validation should also
    // remove this line; if the line stays but the re-validation
    // is added, the doc lies.
    expect(
      src,
      "L1-c6 violated: the doc-block must explicitly note that " +
        "the dispatcher does NOT re-validate so future readers " +
        "know the gate's verdict is the only check.",
    ).toMatch(/dispatcher does NOT re-validate|no re-evaluation happens at dispatch/i);
  });

  it("doc-block points at the M3-c6 sweep + M2-c6 UNIQUE for operators wanting tighter semantics", () => {
    // Rather than offering re-validation, point operators at the
    // existing M3-c6 + M2-c6 mechanisms. Catches a future PR
    // that drops the remediation pointers and leaves operators
    // without guidance.
    expect(src).toMatch(/M3-c6[\s\S]{0,200}sweep[\s\S]{0,200}M2-c6[\s\S]{0,80}UNIQUE/);
  });
});

describe("L2-c6 — resolveApprovalOwner nullable-agentDraftId doc-block", () => {
  const src = readFileSync(TOOL_APPROVALS_ROUTER_PATH, "utf8");

  it("source carries the L2-c6 closure marker", () => {
    expect(
      src,
      "L2-c6 violated: tool-approvals-router.ts must carry the " +
        "`L2-c6` closure marker so a future audit can trace the " +
        "nullable-agentDraftId documentation back to its origin.",
    ).toMatch(/L2-c6\b/);
  });

  it("doc-block explains why agentDraftId can be NULL (legacy rows)", () => {
    // Without the "why," future readers may assume the field is
    // already NOT NULL and "fix" the join chain to crash on null
    // instead of returning null gracefully.
    expect(
      src,
      "L2-c6 violated: the doc-block must explain WHY " +
        "agentDraftId can be NULL (legacy rows pre-D-APP-EXT-2 " +
        "with no backfill).",
    ).toMatch(/legacy[\s\S]{0,200}D-APP-EXT-2|D-APP-EXT-2[\s\S]{0,200}backfill/i);
  });

  it("doc-block explains the correct verify-then-decide behavior (innerJoin returns no rows → null → NOT_FOUND)", () => {
    // Pin the correct behavior so a future PR doesn't "fix" the
    // join to LEFT JOIN (which would return a row but with null
    // owner — bypassing the C2-c6 owner check entirely).
    expect(
      src,
      "L2-c6 violated: the doc-block must explain the " +
        "verify-then-decide chain (innerJoin → null → NOT_FOUND) " +
        "so a future PR doesn't 'fix' the join to LEFT JOIN and " +
        "bypass the C2-c6 owner check.",
    ).toMatch(/innerJoin[\s\S]{0,200}null|NULL[\s\S]{0,200}innerJoin/);
  });

  it("doc-block surfaces the operator-triage distinction (404 typo vs 404 legacy)", () => {
    // Operators reading support tickets need to distinguish the
    // two 404 causes. Without this, every "decide returns 404"
    // gets investigated as a typo when it might be a legacy-row
    // backfill task.
    expect(
      src,
      "L2-c6 violated: the doc-block must surface the operator-" +
        "triage distinction between 404-typo and 404-legacy-row " +
        "so support tickets can be routed correctly.",
    ).toMatch(/triag[\s\S]{0,400}legacy/i);
  });

  it("doc-block names the future-PR clean-up trigger (D-APP-EXT-2 backfill + NOT NULL)", () => {
    // The doc-block has a planned removal trigger. Naming it
    // prevents the doc from outliving its usefulness.
    expect(src).toMatch(/D-APP-EXT-2 backfill[\s\S]{0,200}NOT NULL/);
  });
});
