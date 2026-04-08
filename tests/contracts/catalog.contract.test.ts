/**
 * Agent 2 — Catalog Contract Tests
 *
 * Validates invariants:
 *   I2: Catalog owns intake (candidate creation)
 *   I4: Only Catalog-approved + active entries are usable
 *   I6: Audit blocks critical mutation
 *
 * Tests verify Catalog lifecycle authority and intake ownership.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
  createTestBundle,
  makeEntryAvailable,
  getTestDb,
  assertI4_OnlyCatalogApprovedActive,
} from "../helpers/governance-harness";
import {
  getCatalogEntries,
  getCatalogEntryById,
  updateCatalogEntry,
  approveCatalogEntry,
  deleteCatalogEntry,
} from "../../server/db/catalog";
import {
  checkCatalogAvailability,
  isCatalogEntryAvailableForAppUse,
  CATALOG_AVAILABILITY_FILTERS,
} from "../../server/ai-types/availability";
import { getCatalogState } from "../../shared/catalog-state";

describe.runIf(hasDb)("Catalog Contract — I2, I4, I6", () => {
  afterEach(async () => {
    await cleanup();
  });

  // ══════════════════════════════════════════════════════════════════════
  // I2: Catalog owns intake — candidate creation
  // ══════════════════════════════════════════════════════════════════════

  it("I2: new catalog entry starts as draft + needs_review (candidate)", async () => {
    const entry = await createTestEntry({
      entryType: "agent",
      status: "draft",
      reviewState: "needs_review",
      tags: ["candidate"],
    });

    expect(entry.status).toBe("draft");
    expect(entry.reviewState).toBe("needs_review");
    expect((entry.tags as string[]).includes("candidate")).toBe(true);

    const state = getCatalogState({
      status: entry.status,
      reviewState: entry.reviewState,
      tags: entry.tags as string[],
    });
    expect(state.isCandidate).toBe(true);
    expect(state.label).toBe("candidate");
  });

  it("I2: catalog intake assigns correct origin", async () => {
    const discoveryEntry = await createTestEntry({
      entryType: "provider",
      origin: "discovery",
      status: "draft",
      reviewState: "needs_review",
    });
    expect(discoveryEntry.origin).toBe("discovery");

    const adminEntry = await createTestEntry({
      entryType: "model",
      origin: "admin",
      status: "draft",
      reviewState: "needs_review",
    });
    expect(adminEntry.origin).toBe("admin");
  });

  it("I2: each AI type can be imported into catalog with unique tracking", async () => {
    const types = ["agent", "model", "bot", "llm", "provider"] as const;
    const ids: number[] = [];

    for (const entryType of types) {
      const entry = await createTestEntry({
        entryType,
        status: "draft",
        reviewState: "needs_review",
        tags: ["candidate"],
      });
      ids.push(entry.id);
      expect(entry.entryType).toBe(entryType);
    }

    // All IDs must be unique
    expect(new Set(ids).size).toBe(types.length);
  });

  // ══════════════════════════════════════════════════════════════════════
  // I4: Only Catalog-approved + active entries are usable
  // ══════════════════════════════════════════════════════════════════════

  it("I4: full lifecycle to availability — step by step with invariant checks", async () => {
    // Step 1: Create candidate
    const entry = await createTestEntry({
      entryType: "bot",
      status: "draft",
      reviewState: "needs_review",
      tags: ["candidate"],
    });
    assertI4_OnlyCatalogApprovedActive(entry); // must be false

    // Step 2: Approve
    const approved = await approveCatalogEntry(entry.id, 1);
    assertI4_OnlyCatalogApprovedActive(approved); // still draft, must be false

    // Step 3: Activate
    const activated = await updateCatalogEntry(entry.id, { status: "active" }, 1);
    assertI4_OnlyCatalogApprovedActive(activated); // active + approved = true!

    // Step 4: Verify availability helpers agree
    expect(isCatalogEntryAvailableForAppUse(activated)).toBe(true);
    const avail = checkCatalogAvailability(activated);
    expect(avail.available).toBe(true);
    expect(avail.reasons).toEqual([]);
  });

  it("I4: rejected entry is NEVER available even if active", async () => {
    const entry = await createTestEntry({
      entryType: "llm",
      status: "active",
      reviewState: "rejected",
    });

    assertI4_OnlyCatalogApprovedActive(entry);
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);
  });

  it("I4: deprecated entry is NEVER available even if approved", async () => {
    const entry = await createTestEntry({
      entryType: "provider",
      status: "deprecated",
      reviewState: "approved",
    });

    assertI4_OnlyCatalogApprovedActive(entry);
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);
  });

  it("I4: disabled entry is NEVER available", async () => {
    const entry = await createTestEntry({
      entryType: "model",
      status: "disabled",
      reviewState: "approved",
    });

    assertI4_OnlyCatalogApprovedActive(entry);
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);
  });

  it("I4: CATALOG_AVAILABILITY_FILTERS return only truly available entries", async () => {
    const avail = await createTestEntry({
      entryType: "agent",
      status: "active",
      reviewState: "approved",
    });

    const draft = await createTestEntry({
      entryType: "agent",
      status: "draft",
      reviewState: "needs_review",
    });

    const rejected = await createTestEntry({
      entryType: "agent",
      status: "active",
      reviewState: "rejected",
    });

    const results = await getCatalogEntries({
      entryType: "agent",
      ...CATALOG_AVAILABILITY_FILTERS,
    });

    const ids = results.map((r) => r.id);
    expect(ids).toContain(avail.id);
    expect(ids).not.toContain(draft.id);
    expect(ids).not.toContain(rejected.id);
  });

  // ══════════════════════════════════════════════════════════════════════
  // I6: Audit on critical mutation (verified via DB presence)
  // ══════════════════════════════════════════════════════════════════════

  it("I6: version record is created when entry is updated", async () => {
    const { getCatalogEntryVersions } = await import("../../server/db/catalog");

    const entry = await createTestEntry({ config: { v: 1 } });

    // Initial creation should have version 1
    let versions = await getCatalogEntryVersions(entry.id);
    expect(versions.length).toBe(1);

    // Update → version 2
    await updateCatalogEntry(entry.id, { config: { v: 2 } }, 1);
    versions = await getCatalogEntryVersions(entry.id);
    expect(versions.length).toBe(2);
  });

  it("I6: publish creates immutable bundle with hash", async () => {
    const entry = await createTestEntry({
      entryType: "agent",
      status: "active",
      reviewState: "approved",
    });

    const bundle = await createTestBundle(entry.id, {
      snapshot: { name: "test", config: { key: "value" } },
    });

    expect(bundle.id).toBeGreaterThan(0);
    expect(bundle.snapshotHash).toBeTruthy();
    expect(bundle.status).toBe("active");
    expect(bundle.snapshot).toEqual({ name: "test", config: { key: "value" } });
  });
});
