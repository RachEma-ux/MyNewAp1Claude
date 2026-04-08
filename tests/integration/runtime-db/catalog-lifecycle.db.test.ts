/**
 * Catalog Lifecycle — Real DB Integration Tests
 *
 * Validates the full lifecycle of a catalog entry against a real PostgreSQL
 * database: creation, approval, publishing, activation, and availability.
 *
 * Requires DATABASE_URL to be set. Skips gracefully otherwise.
 */

import { describe, it, expect, afterEach } from "vitest";
import { hasDb, cleanup, createTestEntry, createTestBundle, makeEntryAvailable } from "./helpers/db-harness";
import { getCatalogEntries, getCatalogEntryById, updateCatalogEntry, approveCatalogEntry, getActiveBundleForEntry } from "../../../server/db/catalog";
import { checkCatalogAvailability, isCatalogEntryAvailableForAppUse, CATALOG_AVAILABILITY_FILTERS } from "../../../server/ai-types/availability";
import { getCatalogState } from "../../../shared/catalog-state";

describe.runIf(hasDb)("Catalog Lifecycle — Real DB", () => {
  afterEach(async () => {
    await cleanup();
  });

  // ==========================================================================
  // Happy path: full lifecycle to availability
  // ==========================================================================

  it("entry progresses through full lifecycle: draft → approved → published → active → available", async () => {
    // Step 1: Create draft entry
    const entry = await createTestEntry({
      entryType: "agent",
      status: "draft",
      reviewState: "needs_review",
      tags: ["candidate"],
    });

    expect(entry.id).toBeGreaterThan(0);
    expect(entry.status).toBe("draft");
    expect(entry.reviewState).toBe("needs_review");

    // Verify NOT available at draft stage
    let avail = checkCatalogAvailability(entry);
    expect(avail.available).toBe(false);
    expect(avail.reasons.length).toBeGreaterThan(0);

    // Step 2: Approve
    const approved = await approveCatalogEntry(entry.id, 1);
    expect(approved.reviewState).toBe("approved");

    // Still not available — status is still draft
    avail = checkCatalogAvailability(approved);
    expect(avail.available).toBe(false);

    // Step 3: Publish (add tag + create bundle)
    await updateCatalogEntry(entry.id, {
      tags: ["candidate", "registered", "published"],
    }, 1);
    const bundle = await createTestBundle(entry.id);
    expect(bundle.status).toBe("active");

    // Step 4: Activate
    const activated = await updateCatalogEntry(entry.id, {
      status: "active",
    }, 1);
    expect(activated.status).toBe("active");

    // NOW available
    avail = checkCatalogAvailability(activated);
    expect(avail.available).toBe(true);
    expect(avail.reasons).toEqual([]);

    // Also check boolean helper
    expect(isCatalogEntryAvailableForAppUse(activated)).toBe(true);

    // And unified state helper
    const state = getCatalogState({
      status: activated.status,
      reviewState: activated.reviewState,
      tags: activated.tags as string[] ?? [],
    });
    expect(state.isAvailableForAppUse).toBe(true);
    expect(state.label).toBe("available"); // active + approved + published tag
  });

  // ==========================================================================
  // Rejection path
  // ==========================================================================

  it("rejected entry is never available regardless of status", async () => {
    const entry = await createTestEntry({
      entryType: "model",
      status: "draft",
      reviewState: "needs_review",
    });

    // Reject it
    const rejected = await updateCatalogEntry(entry.id, {
      reviewState: "rejected",
    }, 1);

    expect(isCatalogEntryAvailableForAppUse(rejected)).toBe(false);

    // Even if we force-activate a rejected entry, it must NOT be available
    const activated = await updateCatalogEntry(entry.id, {
      status: "active",
    }, 1);

    expect(isCatalogEntryAvailableForAppUse(activated)).toBe(false);
    const avail = checkCatalogAvailability(activated);
    expect(avail.available).toBe(false);
    expect(avail.reasons.some((r) => r.includes("rejected"))).toBe(true);
  });

  // ==========================================================================
  // Deprecation path
  // ==========================================================================

  it("deprecated entry becomes unavailable even if previously available", async () => {
    // Create and make available
    const entry = await createTestEntry({ entryType: "bot" });
    const { entry: available } = await makeEntryAvailable(entry.id);

    expect(isCatalogEntryAvailableForAppUse(available!)).toBe(true);

    // Deprecate
    const deprecated = await updateCatalogEntry(entry.id, {
      status: "deprecated",
    }, 1);

    expect(isCatalogEntryAvailableForAppUse(deprecated)).toBe(false);
    const avail = checkCatalogAvailability(deprecated);
    expect(avail.available).toBe(false);
    expect(avail.reasons.some((r) => r.includes("deprecated"))).toBe(true);

    // State label
    const state = getCatalogState({
      status: deprecated.status,
      reviewState: deprecated.reviewState,
      tags: deprecated.tags as string[] ?? [],
    });
    expect(state.label).toBe("deprecated");
  });

  // ==========================================================================
  // Disabled path
  // ==========================================================================

  it("disabled entry is not available", async () => {
    const entry = await createTestEntry({ entryType: "provider" });
    const { entry: available } = await makeEntryAvailable(entry.id);
    expect(isCatalogEntryAvailableForAppUse(available!)).toBe(true);

    // Disable
    const disabled = await updateCatalogEntry(entry.id, {
      status: "disabled",
    }, 1);

    expect(isCatalogEntryAvailableForAppUse(disabled)).toBe(false);
    const state = getCatalogState({
      status: disabled.status,
      reviewState: disabled.reviewState,
      tags: disabled.tags as string[] ?? [],
    });
    expect(state.label).toBe("disabled");
  });

  // ==========================================================================
  // Publish bundle lifecycle
  // ==========================================================================

  it("active bundle is retrievable for an entry; superseded bundles are not active", async () => {
    const entry = await createTestEntry({ entryType: "agent" });

    // Create first bundle
    const bundle1 = await createTestBundle(entry.id, {
      versionLabel: `v1.0.0-test-${Date.now()}-a`,
      snapshot: { config: { version: 1 } },
    });
    expect(bundle1.status).toBe("active");

    // Active bundle should be retrievable
    let activeBundle = await getActiveBundleForEntry(entry.id);
    expect(activeBundle).not.toBeNull();
    expect(activeBundle!.id).toBe(bundle1.id);

    // Create second bundle — first should be superseded
    const bundle2 = await createTestBundle(entry.id, {
      versionLabel: `v2.0.0-test-${Date.now()}-b`,
      snapshot: { config: { version: 2 } },
    });

    activeBundle = await getActiveBundleForEntry(entry.id);
    expect(activeBundle).not.toBeNull();
    expect(activeBundle!.id).toBe(bundle2.id);
  });

  // ==========================================================================
  // Version tracking
  // ==========================================================================

  it("config updates create new version records", async () => {
    const { getCatalogEntryVersions } = await import("../../../server/db/catalog");

    const entry = await createTestEntry({
      config: { step: 1 },
    });

    // Initial version created by createCatalogEntry
    let versions = await getCatalogEntryVersions(entry.id);
    expect(versions.length).toBe(1);
    expect(versions[0].version).toBe(1);

    // Update config → should create version 2
    await updateCatalogEntry(entry.id, {
      config: { step: 2 },
    }, 1);

    versions = await getCatalogEntryVersions(entry.id);
    expect(versions.length).toBe(2);
    // Versions come back in desc order
    expect(versions[0].version).toBe(2);
    expect(versions[1].version).toBe(1);
  });
});
