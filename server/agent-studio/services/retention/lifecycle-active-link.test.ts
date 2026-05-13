import { describe, expect, it } from "vitest";

import {
  isApprovalStepLinkedToActiveRelease,
  isNotePromotionLinkedToActiveVersion,
  isPublishRequestLinkedToActiveRelease,
} from "./lifecycle-active-link";

// These helpers fail-soft on ASDB-null. In CI / test environments the
// ASDB connection is typically unavailable; the test confirms the
// fail-soft contract holds — every helper returns `true` (block) when
// it can't reach the database.
//
// Behaviorally-rich tests (active vs archived release returns
// different verdicts) live in the eligibility integration tests which
// stand up an in-memory ASDB. This unit-level file pins only the
// fail-soft invariants — when the production code accidentally swaps
// `return true` for `return false` on the error path, this catches it.

describe("active-link helpers — fail-soft on ASDB unavailable", () => {
  it("isPublishRequestLinkedToActiveRelease returns true when getDb returns null", async () => {
    const result = await isPublishRequestLinkedToActiveRelease(
      { publishRequestId: 1 },
      { getDb: () => null as unknown as ReturnType<typeof import("../../db/connection").getAsDb> },
    );
    expect(result).toBe(true);
  });

  it("isApprovalStepLinkedToActiveRelease returns true when getDb returns null", async () => {
    const result = await isApprovalStepLinkedToActiveRelease(
      { approvalStepId: 1 },
      { getDb: () => null as unknown as ReturnType<typeof import("../../db/connection").getAsDb> },
    );
    expect(result).toBe(true);
  });

  it("isNotePromotionLinkedToActiveVersion returns true when getDb returns null", async () => {
    const result = await isNotePromotionLinkedToActiveVersion(
      { promotionId: 1 },
      { getDb: () => null as unknown as ReturnType<typeof import("../../db/connection").getAsDb> },
    );
    expect(result).toBe(true);
  });
});
