/**
 * Catalog Availability — Real DB Integration Tests
 *
 * Validates the governance invariant: ONLY status=active AND reviewState=approved
 * entries are available for app usage. Tests against a real PostgreSQL database
 * using real DB queries, real authority helpers, and real filter constants.
 *
 * Requires DATABASE_URL to be set. Skips gracefully otherwise.
 */

import { describe, it, expect, afterEach } from "vitest";
import { hasDb, cleanup, createTestEntry, makeEntryAvailable } from "./helpers/db-harness";
import { getCatalogEntries, getCatalogEntryById, updateCatalogEntry } from "../../../server/db/catalog";
import { checkCatalogAvailability, isCatalogEntryAvailableForAppUse, CATALOG_AVAILABILITY_FILTERS } from "../../../server/ai-types/availability";
import { getCatalogState } from "../../../shared/catalog-state";

describe.runIf(hasDb)("Catalog Availability — Real DB", () => {
  afterEach(async () => {
    await cleanup();
  });

  // ==========================================================================
  // Exhaustive 4×3 matrix: all status × reviewState combinations
  // ==========================================================================

  const statuses = ["draft", "active", "deprecated", "disabled"] as const;
  const reviewStates = ["needs_review", "approved", "rejected"] as const;

  for (const status of statuses) {
    for (const reviewState of reviewStates) {
      const expectAvailable = status === "active" && reviewState === "approved";

      it(`status=${status}, reviewState=${reviewState} → available=${expectAvailable}`, async () => {
        const entry = await createTestEntry({
          status,
          reviewState,
          entryType: "agent",
          tags: ["candidate"],
        });

        // Read back from DB to verify persistence
        const dbEntry = await getCatalogEntryById(entry.id);
        expect(dbEntry).not.toBeNull();
        expect(dbEntry!.status).toBe(status);
        expect(dbEntry!.reviewState).toBe(reviewState);

        // Test availability through all three authority paths:

        // 1. Detailed check
        const avail = checkCatalogAvailability(dbEntry!);
        expect(avail.available).toBe(expectAvailable);

        // 2. Boolean shortcut
        expect(isCatalogEntryAvailableForAppUse(dbEntry!)).toBe(expectAvailable);

        // 3. Unified state helper
        const state = getCatalogState({
          status: dbEntry!.status,
          reviewState: dbEntry!.reviewState,
          tags: dbEntry!.tags as string[] ?? [],
        });
        expect(state.isAvailableForAppUse).toBe(expectAvailable);
      });
    }
  }

  // ==========================================================================
  // CATALOG_AVAILABILITY_FILTERS — DB query consistency
  // ==========================================================================

  it("getCatalogEntries with CATALOG_AVAILABILITY_FILTERS returns ONLY available entries", async () => {
    // Create a mix: one available, several not
    const available = await createTestEntry({
      entryType: "llm",
      status: "active",
      reviewState: "approved",
      tags: ["candidate", "published"],
    });

    const draft = await createTestEntry({
      entryType: "llm",
      status: "draft",
      reviewState: "needs_review",
    });

    const rejectedActive = await createTestEntry({
      entryType: "llm",
      status: "active",
      reviewState: "rejected",
    });

    const deprecatedApproved = await createTestEntry({
      entryType: "llm",
      status: "deprecated",
      reviewState: "approved",
    });

    // Query with availability filters
    const results = await getCatalogEntries({
      entryType: "llm",
      ...CATALOG_AVAILABILITY_FILTERS,
    });

    // The available entry must be in results
    const resultIds = results.map((r) => r.id);
    expect(resultIds).toContain(available.id);

    // The unavailable entries must NOT be in results
    expect(resultIds).not.toContain(draft.id);
    expect(resultIds).not.toContain(rejectedActive.id);
    expect(resultIds).not.toContain(deprecatedApproved.id);
  });

  // ==========================================================================
  // Availability transitions — real DB state changes
  // ==========================================================================

  it("availability toggles correctly as entry moves through states", async () => {
    const entry = await createTestEntry({
      entryType: "bot",
      status: "draft",
      reviewState: "needs_review",
    });

    // Phase 1: draft + needs_review → NOT available
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);

    // Phase 2: approve → still NOT available (still draft)
    const approved = await updateCatalogEntry(entry.id, { reviewState: "approved" }, 1);
    expect(isCatalogEntryAvailableForAppUse(approved)).toBe(false);

    // Phase 3: activate → NOW available
    const activated = await updateCatalogEntry(entry.id, { status: "active" }, 1);
    expect(isCatalogEntryAvailableForAppUse(activated)).toBe(true);

    // Phase 4: deprecate → NOT available again
    const deprecated = await updateCatalogEntry(entry.id, { status: "deprecated" }, 1);
    expect(isCatalogEntryAvailableForAppUse(deprecated)).toBe(false);

    // Phase 5: re-activate → available again
    const reactivated = await updateCatalogEntry(entry.id, { status: "active" }, 1);
    expect(isCatalogEntryAvailableForAppUse(reactivated)).toBe(true);

    // Phase 6: reject → NOT available
    const rejected = await updateCatalogEntry(entry.id, { reviewState: "rejected" }, 1);
    expect(isCatalogEntryAvailableForAppUse(rejected)).toBe(false);
  });

  // ==========================================================================
  // Cross-domain availability — different entryTypes use same rule
  // ==========================================================================

  it("availability rule is consistent across all AI Type domains", async () => {
    const domains = ["agent", "model", "bot", "llm", "provider"] as const;

    for (const entryType of domains) {
      // Create available entry for this domain
      const available = await createTestEntry({
        entryType,
        status: "active",
        reviewState: "approved",
      });

      // Create unavailable entry for this domain
      const unavailable = await createTestEntry({
        entryType,
        status: "draft",
        reviewState: "needs_review",
      });

      // Query with filters
      const results = await getCatalogEntries({
        entryType,
        ...CATALOG_AVAILABILITY_FILTERS,
      });

      const resultIds = results.map((r) => r.id);
      expect(resultIds).toContain(available.id);
      expect(resultIds).not.toContain(unavailable.id);
    }
  });

  // ==========================================================================
  // Reason messages — verify helpful blocking reasons
  // ==========================================================================

  it("checkCatalogAvailability provides descriptive blocking reasons", async () => {
    // Draft
    const draft = await createTestEntry({ status: "draft", reviewState: "needs_review" });
    const draftAvail = checkCatalogAvailability(draft);
    expect(draftAvail.available).toBe(false);
    expect(draftAvail.reasons.length).toBe(2); // both status and reviewState fail
    expect(draftAvail.reasons.some((r) => r.includes("draft"))).toBe(true);
    expect(draftAvail.reasons.some((r) => r.includes("review"))).toBe(true);

    // Active but rejected
    const rejected = await createTestEntry({ status: "active", reviewState: "rejected" });
    const rejAvail = checkCatalogAvailability(rejected);
    expect(rejAvail.available).toBe(false);
    expect(rejAvail.reasons.length).toBe(1); // only reviewState fails
    expect(rejAvail.reasons[0]).toContain("rejected");

    // Deprecated but approved
    const deprecated = await createTestEntry({ status: "deprecated", reviewState: "approved" });
    const depAvail = checkCatalogAvailability(deprecated);
    expect(depAvail.available).toBe(false);
    expect(depAvail.reasons.length).toBe(1);
    expect(depAvail.reasons[0]).toContain("deprecated");
  });
});
