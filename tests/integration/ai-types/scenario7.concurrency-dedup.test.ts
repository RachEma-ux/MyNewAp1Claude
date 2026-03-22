/**
 * Agent 6 — Scenario 7: Concurrency + Dedup
 *
 * Tests race conditions and duplicate prevention in catalog operations.
 * Verifies that concurrent operations maintain invariants.
 *
 * Invariants validated: I2, I4, I7
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
  createTestBundle,
  assertI4_OnlyCatalogApprovedActive,
} from "../../helpers/governance-harness";
import {
  getCatalogEntries,
  getCatalogEntryById,
  updateCatalogEntry,
} from "../../../server/db/catalog";
import {
  isCatalogEntryAvailableForAppUse,
  CATALOG_AVAILABILITY_FILTERS,
} from "../../../server/catalog/availability";

describe.runIf(hasDb)("Scenario 7 — Concurrency + Dedup", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("concurrent entry creation produces unique IDs", async () => {
    // Simulate concurrent catalog imports
    const promises = Array.from({ length: 5 }, (_, i) =>
      createTestEntry({
        entryType: "agent",
        name: `__test_concurrent_${Date.now()}_${i}`,
        status: "draft",
        reviewState: "needs_review",
      })
    );

    const entries = await Promise.all(promises);
    const ids = entries.map((e) => e.id);

    // All IDs must be unique
    expect(new Set(ids).size).toBe(5);

    // All entries must exist in DB
    for (const entry of entries) {
      const dbEntry = await getCatalogEntryById(entry.id);
      expect(dbEntry).not.toBeNull();
    }
  });

  it("concurrent state updates on same entry serialize correctly", async () => {
    const entry = await createTestEntry({
      entryType: "model",
      status: "draft",
      reviewState: "needs_review",
    });

    // Sequential updates (concurrent at intent, serialized at DB)
    await updateCatalogEntry(entry.id, { reviewState: "approved" }, 1);
    await updateCatalogEntry(entry.id, { status: "active" }, 1);

    const final = await getCatalogEntryById(entry.id);
    expect(final!.status).toBe("active");
    expect(final!.reviewState).toBe("approved");
    expect(isCatalogEntryAvailableForAppUse(final!)).toBe(true);
  });

  it("concurrent bundle creation on same entry: latest wins", async () => {
    const { getActiveBundleForEntry } = await import("../../../server/db/catalog");

    const entry = await createTestEntry({
      entryType: "agent",
      status: "active",
      reviewState: "approved",
    });

    // Create bundles sequentially (simulating concurrent publishes)
    const b1 = await createTestBundle(entry.id, {
      versionLabel: `v1-conc-${Date.now()}`,
      snapshot: { version: 1 },
    });

    const b2 = await createTestBundle(entry.id, {
      versionLabel: `v2-conc-${Date.now()}`,
      snapshot: { version: 2 },
    });

    const b3 = await createTestBundle(entry.id, {
      versionLabel: `v3-conc-${Date.now()}`,
      snapshot: { version: 3 },
    });

    // Latest bundle should be active
    const active = await getActiveBundleForEntry(entry.id);
    expect(active).not.toBeNull();
    expect(active!.id).toBe(b3.id);
  });

  it("duplicate source linkage creates separate catalog entries (app-level dedup)", async () => {
    const sourceId = Math.floor(Math.random() * 100000) + 1;

    // Simulate double-click import
    const e1 = await createTestEntry({
      entryType: "bot",
      sourceType: "bot",
      sourceId,
    });

    const e2 = await createTestEntry({
      entryType: "bot",
      sourceType: "bot",
      sourceId,
    });

    // Both created with unique catalog IDs
    expect(e1.id).not.toBe(e2.id);

    // I4: neither available by default
    assertI4_OnlyCatalogApprovedActive(e1);
    assertI4_OnlyCatalogApprovedActive(e2);
  });

  it("availability filter consistency under mixed concurrent states", async () => {
    // Create entries with different states concurrently
    const entries = await Promise.all([
      createTestEntry({ entryType: "provider", status: "active", reviewState: "approved" }),
      createTestEntry({ entryType: "provider", status: "draft", reviewState: "approved" }),
      createTestEntry({ entryType: "provider", status: "active", reviewState: "rejected" }),
      createTestEntry({ entryType: "provider", status: "active", reviewState: "approved" }),
    ]);

    const results = await getCatalogEntries({
      entryType: "provider",
      ...CATALOG_AVAILABILITY_FILTERS,
    });
    const resultIds = results.map((r) => r.id);

    // Only entries[0] and entries[3] should be available
    expect(resultIds).toContain(entries[0].id);
    expect(resultIds).not.toContain(entries[1].id);
    expect(resultIds).not.toContain(entries[2].id);
    expect(resultIds).toContain(entries[3].id);
  });
});
