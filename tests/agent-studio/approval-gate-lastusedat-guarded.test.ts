/**
 * M1-c6 (cycle-6 audit `/sdcard/Download/RUNTIME_GATE_AUDIT_2026-05-09.md`
 * §M1-c6) — `lastUsedAt` UPDATE staleness-guard lockstep.
 *
 * Pre-cycle-6 `evaluateApprovalGate`'s permit branch unconditionally
 * UPDATEd `lastUsedAt = now()`. Benign at the row level (Postgres
 * serializes concurrent UPDATEs) but produced audit-log noise on
 * tight permit loops — an agent retrying a tool call repeatedly
 * within seconds of the previous permit hammered the row with
 * UPDATEs that contained near-identical timestamps.
 *
 * Post-cycle-6: only UPDATE when `lastUsedAt` is null OR older than
 * `LAST_USED_STALENESS_MS` (60s). Reduces UPDATE traffic to
 * at-most-one-per-staleness-window per row.
 *
 * This test pins the source pattern. Behavioral integration coverage
 * (concurrent permit-eval calls produce ≤1 UPDATE per minute) is
 * deferred to a B-coverage follow-up against live ASDB — mirrors
 * cycle-4 L2-c4 / cycle-6 C2-c6 pattern of source-scan-now +
 * integration-later.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const APPROVAL_GATE_PATH = join(
  process.cwd(),
  "server/agent-studio/services/approval/approval-gate.ts",
);

describe("M1-c6 — evaluateApprovalGate lastUsedAt UPDATE is staleness-guarded", () => {
  const src = readFileSync(APPROVAL_GATE_PATH, "utf8");

  it("source carries the M1-c6 closure marker", () => {
    expect(
      src,
      "M1-c6 violated: approval-gate.ts must carry the `M1-c6` " +
        "closure marker so a future audit can trace the staleness " +
        "guard back to its origin item.",
    ).toMatch(/M1-c6\b/);
  });

  it("source defines LAST_USED_STALENESS_MS constant", () => {
    expect(
      src,
      "M1-c6 violated: approval-gate.ts must define the " +
        "`LAST_USED_STALENESS_MS` constant. Without a named " +
        "constant, future readers can't grep for the threshold + " +
        "the guard intent is hidden inside an arithmetic literal.",
    ).toMatch(/LAST_USED_STALENESS_MS\b/);
  });

  it("source guards the lastUsedAt UPDATE behind an isStale check", () => {
    // The structure: `if (isStale) { db.update(...).set({ lastUsedAt: now }) }`
    // Catches a future PR that removes the guard or moves the UPDATE
    // outside the conditional.
    expect(
      src,
      "M1-c6 violated: approval-gate.ts no longer guards the " +
        "`lastUsedAt` UPDATE behind an `isStale` check. The audit's " +
        "concern was unconditional UPDATEs producing audit-log " +
        "noise on tight permit loops; removing the guard reverts " +
        "the behavior.",
    ).toMatch(/isStale\b[\s\S]{0,200}\.update\s*\([\s\S]{0,200}lastUsedAt/);
  });

  it("source computes isStale from `lastUsedAt < now - threshold`", () => {
    // Catches a future PR that flips the comparison to `>` (which
    // would invert the semantic — UPDATE only when fresh, never
    // when stale, the opposite of what M1-c6 wants).
    expect(
      src,
      "M1-c6 violated: approval-gate.ts must compute `isStale` from " +
        "the `lastUsedAt` value (null OR older than threshold). " +
        "A different predicate could quietly invert the staleness " +
        "semantic.",
    ).toMatch(/isStale\s*=[\s\S]{0,300}LAST_USED_STALENESS_MS/);
  });

  it("source still calls db.update with lastUsedAt (the operation isn't deleted)", () => {
    // M1-c6 is about GUARDING the UPDATE, not removing it. If a
    // future PR drops the UPDATE entirely, the `lastUsedAt` column
    // stops tracking re-use altogether — fails the operator-UI's
    // "recently used" signal.
    expect(
      src,
      "M1-c6 violated: approval-gate.ts no longer writes " +
        "`lastUsedAt` at all. The staleness guard reduces UPDATE " +
        "frequency; it does not eliminate the UPDATE. Operator UI " +
        "still relies on `lastUsedAt` to surface recently-used " +
        "approval rows.",
    ).toMatch(/\.set\s*\(\s*\{\s*lastUsedAt\s*:/);
  });
});
