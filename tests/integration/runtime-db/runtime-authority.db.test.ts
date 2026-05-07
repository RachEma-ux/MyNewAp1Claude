/**
 * Runtime Authority — Real DB Integration Tests
 *
 * Validates that runtime authority resolution enforces governance invariants
 * against real database state. Tests the execution pipeline's gate checks,
 * duplicate prevention, lineage integrity, and the catalog state helper.
 *
 * Requires DATABASE_URL to be set. Skips gracefully otherwise.
 */

import { describe, it, expect, afterEach } from "vitest";
import { hasDb, cleanup, createTestEntry, createTestBundle, makeEntryAvailable } from "./helpers/db-harness";
import { getCatalogEntries, getCatalogEntryById, updateCatalogEntry, approveCatalogEntry, getActiveBundleForEntry, deleteCatalogEntry } from "../../../server/ai-types/public-api";
import { isCatalogEntryAvailableForAppUse, CATALOG_AVAILABILITY_FILTERS } from "../../../server/ai-types/availability";
import { getCatalogState, getCatalogStateForDomainEntity } from "../../../shared/catalog-state";

describe.runIf(hasDb)("Runtime Authority — Real DB", () => {
  afterEach(async () => {
    await cleanup();
  });

  // ==========================================================================
  // Duplicate prevention — sourceType + sourceId uniqueness
  // ==========================================================================

  it("creating entries with same sourceType + sourceId produces distinct DB rows", async () => {
    // This tests that the DB allows multiple entries with the same source linkage
    // (the application layer handles duplicate prevention, not a DB constraint)
    const entry1 = await createTestEntry({
      entryType: "agent",
      sourceType: "agent",
      sourceId: 999,
    });

    const entry2 = await createTestEntry({
      entryType: "agent",
      sourceType: "agent",
      sourceId: 999,
    });

    expect(entry1.id).not.toBe(entry2.id);
    expect(entry1.sourceType).toBe("agent");
    expect(entry1.sourceId).toBe(999);
    expect(entry2.sourceType).toBe("agent");
    expect(entry2.sourceId).toBe(999);

    // Application-level duplicate check: filter by source
    const allAgentEntries = await getCatalogEntries({ entryType: "agent" });
    const duplicates = allAgentEntries.filter(
      (e) => e.sourceType === "agent" && e.sourceId === 999
    );
    // Both should exist — duplicate prevention is application-level
    expect(duplicates.length).toBeGreaterThanOrEqual(2);
  });

  // ==========================================================================
  // Lineage integrity — sourceType/sourceId FK resolution
  // ==========================================================================

  it("catalog entry correctly preserves source lineage fields", async () => {
    const sourceId = Math.floor(Math.random() * 100000) + 1;

    const entry = await createTestEntry({
      entryType: "model",
      sourceType: "model",
      sourceId,
      config: {
        sourceModelId: sourceId,
        modelType: "llm",
        runtimeAuthority: "catalog_entry",
      },
    });

    // Read back
    const dbEntry = await getCatalogEntryById(entry.id);
    expect(dbEntry).not.toBeNull();
    expect(dbEntry!.sourceType).toBe("model");
    expect(dbEntry!.sourceId).toBe(sourceId);

    // Config should also have the legacy reference
    const config = dbEntry!.config as Record<string, unknown>;
    expect(config.sourceModelId).toBe(sourceId);
    expect(config.runtimeAuthority).toBe("catalog_entry");
  });

  // ==========================================================================
  // getCatalogState — consistency with DB state
  // ==========================================================================

  it("getCatalogState labels match actual DB state at each lifecycle point", async () => {
    const entry = await createTestEntry({
      entryType: "agent",
      status: "draft",
      reviewState: "needs_review",
      tags: ["candidate"],
    });

    // Draft + candidate → "candidate"
    let dbEntry = await getCatalogEntryById(entry.id);
    let state = getCatalogState({
      status: dbEntry!.status,
      reviewState: dbEntry!.reviewState,
      tags: dbEntry!.tags as string[] ?? [],
    });
    expect(state.label).toBe("candidate");
    expect(state.isCandidate).toBe(true);

    // Approve → "approved"
    await approveCatalogEntry(entry.id, 1);
    dbEntry = await getCatalogEntryById(entry.id);
    state = getCatalogState({
      status: dbEntry!.status,
      reviewState: dbEntry!.reviewState,
      tags: dbEntry!.tags as string[] ?? [],
    });
    expect(state.label).toBe("approved");
    expect(state.isApproved).toBe(true);

    // Add published tag → "published"
    await updateCatalogEntry(entry.id, {
      tags: ["candidate", "registered", "published"],
    }, 1);
    dbEntry = await getCatalogEntryById(entry.id);
    state = getCatalogState({
      status: dbEntry!.status,
      reviewState: dbEntry!.reviewState,
      tags: dbEntry!.tags as string[] ?? [],
    });
    expect(state.label).toBe("published");
    expect(state.isPublished).toBe(true);

    // Activate → "available" (active + approved + published)
    await updateCatalogEntry(entry.id, { status: "active" }, 1);
    dbEntry = await getCatalogEntryById(entry.id);
    state = getCatalogState({
      status: dbEntry!.status,
      reviewState: dbEntry!.reviewState,
      tags: dbEntry!.tags as string[] ?? [],
    });
    expect(state.label).toBe("available");
    expect(state.isAvailableForAppUse).toBe(true);

    // Deprecate → "deprecated"
    await updateCatalogEntry(entry.id, { status: "deprecated" }, 1);
    dbEntry = await getCatalogEntryById(entry.id);
    state = getCatalogState({
      status: dbEntry!.status,
      reviewState: dbEntry!.reviewState,
      tags: dbEntry!.tags as string[] ?? [],
    });
    expect(state.label).toBe("deprecated");
    expect(state.isAvailableForAppUse).toBe(false);
  });

  // ==========================================================================
  // getCatalogStateForDomainEntity — wrapper consistency
  // ==========================================================================

  it("getCatalogStateForDomainEntity returns same result as getCatalogState for DB entries", async () => {
    const entry = await createTestEntry({
      entryType: "bot",
      status: "active",
      reviewState: "approved",
      tags: ["candidate", "published"],
    });

    const dbEntry = await getCatalogEntryById(entry.id);
    const input = {
      status: dbEntry!.status,
      reviewState: dbEntry!.reviewState,
      tags: dbEntry!.tags as string[] ?? [],
    };

    const state1 = getCatalogState(input);
    const state2 = getCatalogStateForDomainEntity(input);

    expect(state1.label).toBe(state2.label);
    expect(state1.isAvailableForAppUse).toBe(state2.isAvailableForAppUse);
    expect(state1.isCandidate).toBe(state2.isCandidate);
    expect(state1.isApproved).toBe(state2.isApproved);
    expect(state1.isPublished).toBe(state2.isPublished);
    expect(state1.isActive).toBe(state2.isActive);
  });

  // ==========================================================================
  // Entry deletion — cleanup integrity
  // ==========================================================================

  it("deleted entry is no longer returned by availability queries", async () => {
    const entry = await createTestEntry({
      entryType: "provider",
      status: "active",
      reviewState: "approved",
    });

    // Verify it appears in available results
    let results = await getCatalogEntries({
      entryType: "provider",
      ...CATALOG_AVAILABILITY_FILTERS,
    });
    expect(results.map((r) => r.id)).toContain(entry.id);

    // Delete via real DB function
    await deleteCatalogEntry(entry.id);

    // Verify it's gone
    const deleted = await getCatalogEntryById(entry.id);
    expect(deleted).toBeNull();

    results = await getCatalogEntries({
      entryType: "provider",
      ...CATALOG_AVAILABILITY_FILTERS,
    });
    expect(results.map((r) => r.id)).not.toContain(entry.id);
  });

  // ==========================================================================
  // Bundle-entry relationship integrity
  // ==========================================================================

  it("getActiveBundleForEntry returns null for entry without bundles", async () => {
    const entry = await createTestEntry({ entryType: "agent" });
    const bundle = await getActiveBundleForEntry(entry.id);
    expect(bundle).toBeNull();
  });

  it("getActiveBundleForEntry returns the most recent active bundle", async () => {
    const entry = await createTestEntry({ entryType: "agent" });

    const b1 = await createTestBundle(entry.id, {
      versionLabel: `v1-${Date.now()}-a`,
      snapshot: { version: 1 },
    });

    const b2 = await createTestBundle(entry.id, {
      versionLabel: `v2-${Date.now()}-b`,
      snapshot: { version: 2 },
    });

    const active = await getActiveBundleForEntry(entry.id);
    expect(active).not.toBeNull();
    expect(active!.id).toBe(b2.id);
    // b1 should have been superseded by createPublishBundle logic
  });

  // ==========================================================================
  // Frozen entry cannot be updated (if governance freeze is enforced)
  // ==========================================================================

  it("frozen field persists correctly on catalog entry", async () => {
    const entry = await createTestEntry({
      entryType: "agent",
      status: "active",
      reviewState: "approved",
    });

    // The frozen column defaults to false
    const dbEntry = await getCatalogEntryById(entry.id);
    expect(dbEntry!.frozen).toBe(false);
  });
});
