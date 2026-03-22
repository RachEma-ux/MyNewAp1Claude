/**
 * Agent 6 — Scenario 3: Provider Rotation
 *
 * Tests swapping runtime authority between providers while maintaining
 * availability invariants. Verifies selector correctness during rotation.
 *
 * Invariants validated: I4, I5
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
  makeEntryAvailable,
  assertI4_OnlyCatalogApprovedActive,
  assertI5_NoRawDomainLeakage,
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

describe.runIf(hasDb)("Scenario 3 — Provider Rotation", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("deprecating old provider and activating new one swaps runtime authority", async () => {
    // Create two providers — old (active) and new (draft)
    const oldProvider = await createTestEntry({
      entryType: "provider",
      name: `__test_old_provider_${Date.now()}`,
      status: "active",
      reviewState: "approved",
      config: { baseUrl: "https://old-api.example.com" },
    });

    const newProvider = await createTestEntry({
      entryType: "provider",
      name: `__test_new_provider_${Date.now()}`,
      status: "draft",
      reviewState: "needs_review",
      config: { baseUrl: "https://new-api.example.com" },
    });

    // Step 1: old is available, new is not
    expect(isCatalogEntryAvailableForAppUse(oldProvider)).toBe(true);
    expect(isCatalogEntryAvailableForAppUse(newProvider)).toBe(false);
    assertI4_OnlyCatalogApprovedActive(oldProvider);
    assertI4_OnlyCatalogApprovedActive(newProvider);

    // Step 2: approve + activate new provider
    await updateCatalogEntry(newProvider.id, { reviewState: "approved" }, 1);
    await updateCatalogEntry(newProvider.id, { status: "active" }, 1);
    const newActive = await getCatalogEntryById(newProvider.id);
    expect(isCatalogEntryAvailableForAppUse(newActive!)).toBe(true);
    assertI4_OnlyCatalogApprovedActive(newActive!);

    // Step 3: deprecate old provider
    await updateCatalogEntry(oldProvider.id, { status: "deprecated" }, 1);
    const oldDeprecated = await getCatalogEntryById(oldProvider.id);
    expect(isCatalogEntryAvailableForAppUse(oldDeprecated!)).toBe(false);
    assertI4_OnlyCatalogApprovedActive(oldDeprecated!);

    // Step 4: verify selectors only show new provider
    const available = await getCatalogEntries({
      entryType: "provider",
      ...CATALOG_AVAILABILITY_FILTERS,
    });
    const availIds = available.map((a) => a.id);

    expect(availIds).toContain(newProvider.id);
    expect(availIds).not.toContain(oldProvider.id);

    // I5: no raw domain leakage
    assertI5_NoRawDomainLeakage(available.filter((a) => a.id === newProvider.id));
  });

  it("simultaneous active providers are both available", async () => {
    const p1 = await createTestEntry({
      entryType: "provider",
      status: "active",
      reviewState: "approved",
      config: { region: "us-east" },
    });

    const p2 = await createTestEntry({
      entryType: "provider",
      status: "active",
      reviewState: "approved",
      config: { region: "eu-west" },
    });

    expect(isCatalogEntryAvailableForAppUse(p1)).toBe(true);
    expect(isCatalogEntryAvailableForAppUse(p2)).toBe(true);

    const available = await getCatalogEntries({
      entryType: "provider",
      ...CATALOG_AVAILABILITY_FILTERS,
    });
    const ids = available.map((a) => a.id);
    expect(ids).toContain(p1.id);
    expect(ids).toContain(p2.id);
  });
});
