/**
 * Agent 4 — Invalid Transitions Tests
 *
 * Validates that the governance system blocks invalid state transitions.
 * Each test attempts an invalid operation and verifies the system resists it.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
  makeEntryAvailable,
} from "../helpers/governance-harness";
import {
  getCatalogEntryById,
  updateCatalogEntry,
  deleteCatalogEntry,
} from "../../server/ai-types/public-api";
import { isCatalogEntryAvailableForAppUse, CATALOG_AVAILABILITY_FILTERS } from "../../server/ai-types/availability";
import { getCatalogState } from "../../shared/catalog-state";
import { getCatalogEntries } from "../../server/ai-types/public-api";

describe.runIf(hasDb)("Invalid Transitions — Governance Guard", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("rejected entry cannot be made available by changing status alone", async () => {
    const entry = await createTestEntry({
      entryType: "agent",
      status: "draft",
      reviewState: "rejected",
    });

    // Try to activate
    const activated = await updateCatalogEntry(entry.id, { status: "active" }, 1);
    expect(isCatalogEntryAvailableForAppUse(activated)).toBe(false);

    // Must not appear in availability query
    const available = await getCatalogEntries({
      entryType: "agent",
      ...CATALOG_AVAILABILITY_FILTERS,
    });
    expect(available.map((a) => a.id)).not.toContain(entry.id);
  });

  it("deprecated entry with approval is not available", async () => {
    const entry = await createTestEntry({
      entryType: "model",
      status: "deprecated",
      reviewState: "approved",
    });

    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);

    const state = getCatalogState({
      status: entry.status,
      reviewState: entry.reviewState,
      tags: entry.tags as string[],
    });
    expect(state.label).toBe("deprecated");
    expect(state.isAvailableForAppUse).toBe(false);
  });

  it("deleted entry disappears from all queries", async () => {
    const entry = await createTestEntry({
      entryType: "bot",
      status: "active",
      reviewState: "approved",
    });

    // Verify present
    const before = await getCatalogEntries({
      entryType: "bot",
      ...CATALOG_AVAILABILITY_FILTERS,
    });
    expect(before.map((b) => b.id)).toContain(entry.id);

    // Delete
    await deleteCatalogEntry(entry.id);

    // Verify gone
    const after = await getCatalogEntries({
      entryType: "bot",
      ...CATALOG_AVAILABILITY_FILTERS,
    });
    expect(after.map((a) => a.id)).not.toContain(entry.id);

    const deleted = await getCatalogEntryById(entry.id);
    expect(deleted).toBeNull();
  });

  it("null status and reviewState are handled safely", async () => {
    // Test edge case: what if we check availability on partial data
    const result = isCatalogEntryAvailableForAppUse({ status: null, reviewState: null });
    expect(result).toBe(false);

    const result2 = isCatalogEntryAvailableForAppUse({ status: "active", reviewState: null });
    expect(result2).toBe(false);

    const result3 = isCatalogEntryAvailableForAppUse({ status: null, reviewState: "approved" });
    expect(result3).toBe(false);
  });

  it("availability state correctly reverses on deprecation after availability", async () => {
    const entry = await createTestEntry({ entryType: "provider" });
    const { entry: available } = await makeEntryAvailable(entry.id);

    expect(isCatalogEntryAvailableForAppUse(available!)).toBe(true);

    // Deprecate
    const deprecated = await updateCatalogEntry(entry.id, { status: "deprecated" }, 1);
    expect(isCatalogEntryAvailableForAppUse(deprecated)).toBe(false);

    // Verify in DB query
    const results = await getCatalogEntries({
      entryType: "provider",
      ...CATALOG_AVAILABILITY_FILTERS,
    });
    expect(results.map((r) => r.id)).not.toContain(entry.id);
  });
});
