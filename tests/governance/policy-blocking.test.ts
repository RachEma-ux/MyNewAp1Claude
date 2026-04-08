/**
 * Agent 4 — Policy Blocking Tests
 *
 * Validates that governance policies block unauthorized state transitions.
 * Uses real DB to verify that the policy engine correctly prevents
 * unsafe lifecycle operations.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
  assertI4_OnlyCatalogApprovedActive,
} from "../helpers/governance-harness";
import {
  getCatalogEntryById,
  updateCatalogEntry,
  approveCatalogEntry,
} from "../../server/db/catalog";
import { isCatalogEntryAvailableForAppUse, checkCatalogAvailability } from "../../server/ai-types/availability";
import { getCatalogState } from "../../shared/catalog-state";

describe.runIf(hasDb)("Policy Blocking — Governance", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("draft entry cannot become available without approval", async () => {
    const entry = await createTestEntry({
      entryType: "agent",
      status: "draft",
      reviewState: "needs_review",
    });

    // Force activate without approval
    const forced = await updateCatalogEntry(entry.id, { status: "active" }, 1);

    // I4: must NOT be available — reviewState is still needs_review
    assertI4_OnlyCatalogApprovedActive(forced);
    expect(isCatalogEntryAvailableForAppUse(forced)).toBe(false);

    const avail = checkCatalogAvailability(forced);
    expect(avail.available).toBe(false);
    expect(avail.reasons.length).toBeGreaterThan(0);
  });

  it("rejected entry blocks activation path", async () => {
    const entry = await createTestEntry({
      entryType: "model",
      status: "draft",
      reviewState: "rejected",
    });

    // Even if status is forced to active, rejected blocks availability
    const forced = await updateCatalogEntry(entry.id, { status: "active" }, 1);
    expect(isCatalogEntryAvailableForAppUse(forced)).toBe(false);

    const avail = checkCatalogAvailability(forced);
    expect(avail.reasons.some((r) => r.includes("rejected"))).toBe(true);
  });

  it("availability requires both conditions — not just one", async () => {
    // Only active
    const onlyActive = await createTestEntry({
      entryType: "bot",
      status: "active",
      reviewState: "needs_review",
    });
    expect(isCatalogEntryAvailableForAppUse(onlyActive)).toBe(false);

    // Only approved
    const onlyApproved = await createTestEntry({
      entryType: "bot",
      status: "draft",
      reviewState: "approved",
    });
    expect(isCatalogEntryAvailableForAppUse(onlyApproved)).toBe(false);

    // Both
    const both = await createTestEntry({
      entryType: "bot",
      status: "active",
      reviewState: "approved",
    });
    expect(isCatalogEntryAvailableForAppUse(both)).toBe(true);
  });

  it("disabled status blocks availability permanently until re-enabled", async () => {
    const entry = await createTestEntry({
      entryType: "provider",
      status: "active",
      reviewState: "approved",
    });
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(true);

    const disabled = await updateCatalogEntry(entry.id, { status: "disabled" }, 1);
    expect(isCatalogEntryAvailableForAppUse(disabled)).toBe(false);

    const state = getCatalogState({
      status: disabled.status,
      reviewState: disabled.reviewState,
      tags: disabled.tags as string[],
    });
    expect(state.label).toBe("disabled");

    // Re-enable
    const reEnabled = await updateCatalogEntry(entry.id, { status: "active" }, 1);
    expect(isCatalogEntryAvailableForAppUse(reEnabled)).toBe(true);
  });
});
