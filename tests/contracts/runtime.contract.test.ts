/**
 * Agent 3 — Runtime Contract Tests
 *
 * Validates invariants:
 *   I4: Only Catalog-approved + active entries are usable at runtime
 *   I5: No raw domain leakage in app selectors
 *
 * Tests verify that runtime resolution uses Catalog authority exclusively.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
  makeEntryAvailable,
  assertI4_OnlyCatalogApprovedActive,
  assertI5_NoRawDomainLeakage,
} from "../helpers/governance-harness";
import {
  getCatalogEntries,
  getCatalogEntryById,
  updateCatalogEntry,
} from "../../server/db/catalog";
import {
  isCatalogEntryAvailableForAppUse,
  CATALOG_AVAILABILITY_FILTERS,
} from "../../server/catalog/availability";
import { getCatalogState } from "../../shared/catalog-state";

describe.runIf(hasDb)("Runtime Contract — I4, I5", () => {
  afterEach(async () => {
    await cleanup();
  });

  // ══════════════════════════════════════════════════════════════════════
  // I4: Runtime authority — only from Catalog
  // ══════════════════════════════════════════════════════════════════════

  it("I4: runtime query with CATALOG_AVAILABILITY_FILTERS only returns active+approved", async () => {
    // Create entries in every possible state
    const entries = [
      await createTestEntry({ entryType: "agent", status: "draft", reviewState: "needs_review" }),
      await createTestEntry({ entryType: "agent", status: "draft", reviewState: "approved" }),
      await createTestEntry({ entryType: "agent", status: "active", reviewState: "needs_review" }),
      await createTestEntry({ entryType: "agent", status: "active", reviewState: "approved" }), // ONLY this one
      await createTestEntry({ entryType: "agent", status: "active", reviewState: "rejected" }),
      await createTestEntry({ entryType: "agent", status: "deprecated", reviewState: "approved" }),
      await createTestEntry({ entryType: "agent", status: "disabled", reviewState: "approved" }),
    ];

    const results = await getCatalogEntries({
      entryType: "agent",
      ...CATALOG_AVAILABILITY_FILTERS,
    });

    const resultIds = results.map((r) => r.id);

    // Only entry[3] (active + approved) should appear
    expect(resultIds).toContain(entries[3].id);

    // All others must NOT appear
    expect(resultIds).not.toContain(entries[0].id);
    expect(resultIds).not.toContain(entries[1].id);
    expect(resultIds).not.toContain(entries[2].id);
    expect(resultIds).not.toContain(entries[4].id);
    expect(resultIds).not.toContain(entries[5].id);
    expect(resultIds).not.toContain(entries[6].id);
  });

  it("I4: runtime availability changes correctly through state transitions", async () => {
    const entry = await createTestEntry({
      entryType: "model",
      status: "draft",
      reviewState: "needs_review",
    });

    // Step 1: draft+needs_review → NOT available
    assertI4_OnlyCatalogApprovedActive(entry);

    // Step 2: approve → still draft → NOT available
    const approved = await updateCatalogEntry(entry.id, { reviewState: "approved" }, 1);
    assertI4_OnlyCatalogApprovedActive(approved);
    expect(isCatalogEntryAvailableForAppUse(approved)).toBe(false);

    // Step 3: activate → NOW available
    const active = await updateCatalogEntry(entry.id, { status: "active" }, 1);
    assertI4_OnlyCatalogApprovedActive(active);
    expect(isCatalogEntryAvailableForAppUse(active)).toBe(true);

    // Step 4: deprecate → NOT available
    const deprecated = await updateCatalogEntry(entry.id, { status: "deprecated" }, 1);
    assertI4_OnlyCatalogApprovedActive(deprecated);
    expect(isCatalogEntryAvailableForAppUse(deprecated)).toBe(false);

    // Step 5: re-activate → available again
    const reactivated = await updateCatalogEntry(entry.id, { status: "active" }, 1);
    assertI4_OnlyCatalogApprovedActive(reactivated);
    expect(isCatalogEntryAvailableForAppUse(reactivated)).toBe(true);

    // Step 6: reject → NOT available
    const rejected = await updateCatalogEntry(entry.id, { reviewState: "rejected" }, 1);
    assertI4_OnlyCatalogApprovedActive(rejected);
    expect(isCatalogEntryAvailableForAppUse(rejected)).toBe(false);
  });

  // ══════════════════════════════════════════════════════════════════════
  // I5: No raw domain leakage in app selectors
  // ══════════════════════════════════════════════════════════════════════

  it("I5: all entries returned by availability filter have correct catalog metadata", async () => {
    // Create multiple available entries
    const e1 = await createTestEntry({ entryType: "agent", status: "active", reviewState: "approved" });
    const e2 = await createTestEntry({ entryType: "model", status: "active", reviewState: "approved" });
    const e3 = await createTestEntry({ entryType: "bot", status: "active", reviewState: "approved" });

    const results = await getCatalogEntries({ ...CATALOG_AVAILABILITY_FILTERS });

    // Filter to only our test entries
    const ourResults = results.filter((r) => [e1.id, e2.id, e3.id].includes(r.id));

    // I5: no raw domain leakage — all must have proper catalog fields
    assertI5_NoRawDomainLeakage(ourResults);

    for (const r of ourResults) {
      expect(r.status).toBe("active");
      expect(r.reviewState).toBe("approved");
      expect(r.id).toBeGreaterThan(0);
      expect(r.entryType).toBeTruthy();
    }
  });

  it("I5: getCatalogState correctly distinguishes available from non-available", async () => {
    const available = await createTestEntry({
      entryType: "llm",
      status: "active",
      reviewState: "approved",
      tags: ["candidate", "published"],
    });

    const notAvailable = await createTestEntry({
      entryType: "llm",
      status: "draft",
      reviewState: "needs_review",
      tags: ["candidate"],
    });

    const availState = getCatalogState({
      status: available.status,
      reviewState: available.reviewState,
      tags: available.tags as string[],
    });
    expect(availState.isAvailableForAppUse).toBe(true);
    expect(availState.label).toBe("available");

    const notAvailState = getCatalogState({
      status: notAvailable.status,
      reviewState: notAvailable.reviewState,
      tags: notAvailable.tags as string[],
    });
    expect(notAvailState.isAvailableForAppUse).toBe(false);
    expect(notAvailState.label).toBe("candidate");
  });

  it("I5: runtime query consistency — availability filter matches helper", async () => {
    // Create a mix of entries
    const entries = await Promise.all([
      createTestEntry({ entryType: "provider", status: "active", reviewState: "approved" }),
      createTestEntry({ entryType: "provider", status: "draft", reviewState: "approved" }),
      createTestEntry({ entryType: "provider", status: "active", reviewState: "rejected" }),
    ]);

    // DB-level filter
    const dbResults = await getCatalogEntries({
      entryType: "provider",
      ...CATALOG_AVAILABILITY_FILTERS,
    });
    const dbIds = new Set(dbResults.map((r) => r.id));

    // Application-level check
    for (const e of entries) {
      const dbEntry = await getCatalogEntryById(e.id);
      const helperResult = isCatalogEntryAvailableForAppUse(dbEntry!);

      // DB filter and helper must agree
      expect(dbIds.has(e.id)).toBe(helperResult);
    }
  });
});
