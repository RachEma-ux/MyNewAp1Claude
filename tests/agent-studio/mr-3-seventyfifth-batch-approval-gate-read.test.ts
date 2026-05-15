/**
 * MR-3 seventy-fifth batch — services/approval/approval-gate.ts ::
 * evaluateApprovalGate Path-B read promotion.
 * PR-V1-145.
 *
 * Thirteenth read-path Path-X promotion. The pre-existing
 * lastUsedAt UPDATE (#107) was Path-B-migrated; the
 * SELECT-by-(agentDraftId, hash) still ran on bootstrap. This batch
 * hoists the resolveWorkspaceIdForDraft call up to the top of the
 * function and reuses the routed handle for both the SELECT and the
 * stale-row UPDATE — net effect: no extra round-trip vs. the prior
 * shape (resolver call moved from inside the if-isStale branch to
 * top-of-function).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-3 seventy-fifth batch — evaluateApprovalGate Path-B read", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/approval/approval-gate.ts",
  );
  const src = readFileSync(file, "utf8");

  it("evaluateApprovalGate hoists Path B resolver to the top and routes SELECT via the same db handle", () => {
    const startIdx = src.indexOf("export async function evaluateApprovalGate");
    expect(startIdx).toBeGreaterThan(-1);
    const remainder = src.slice(startIdx + "export async function evaluateApprovalGate".length);
    const nextExportIdx = remainder.indexOf("\nexport ");
    const endIdx =
      nextExportIdx >= 0
        ? startIdx + "export async function evaluateApprovalGate".length + nextExportIdx
        : src.length;
    const body = src.slice(startIdx, endIdx);

    // Resolver lives at the top now, not inside the if-isStale.
    expect(
      /resolveWorkspaceIdForDraft\s*\(\s*lookupDb\s*,\s*input\.agentDraftId\s*,?\s*\)/.test(
        body,
      ),
    ).toBe(true);
    // The SELECT uses the routed `db` handle.
    expect(
      /db\s*\n?\s*\.select\s*\(\s*\)\s*\n?\s*\.from\s*\(\s*agsPendingPermissionRequests\s*\)/.test(
        body,
      ),
    ).toBe(true);
    // The lastUsedAt UPDATE also uses the same `db` handle (no
    // duplicate resolver call inside the if-isStale).
    expect(
      /db\s*\n?\s*\.update\s*\(\s*agsPendingPermissionRequests\s*\)/.test(body),
    ).toBe(true);
    // Resolver appears exactly once in evaluateApprovalGate (was
    // inside the if-isStale branch before this batch).
    const matches = body.match(/resolveWorkspaceIdForDraft\s*\(/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
