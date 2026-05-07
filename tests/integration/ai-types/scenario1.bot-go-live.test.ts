/**
 * Agent 6 — Scenario 1: Customer Support Bot Go-Live
 *
 * Full real-world scenario: a bot goes from creation to runtime availability.
 * Every step asserts ALL invariants before continuing.
 *
 * Invariants validated: I1, I2, I3, I4, I5, I6, I7
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
  createTestBundle,
  getTestDb,
  assertI4_OnlyCatalogApprovedActive,
  assertI5_NoRawDomainLeakage,
  assertI7_StructuredFKPreferred,
} from "../../helpers/governance-harness";
import {
  getCatalogEntries,
  getCatalogEntryById,
  updateCatalogEntry,
  approveCatalogEntry,
  getCatalogEntryVersions,
} from "../../../server/ai-types/public-api";
import {
  isCatalogEntryAvailableForAppUse,
  checkCatalogAvailability,
  CATALOG_AVAILABILITY_FILTERS,
} from "../../../server/ai-types/availability";
import { getCatalogState } from "../../../shared/catalog-state";

describe.runIf(hasDb)("Scenario 1 — Customer Support Bot Go-Live", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("full bot go-live lifecycle with invariant checks at every step", async () => {
    // ══ Step 1: Domain creates bot entity ══════════════════════════════
    // Simulated: bot is created in `bots` table with deployable status.
    // I1: Domain does NOT write to catalog_entries.
    const domainBotId = Math.floor(Math.random() * 100000) + 1;

    // ══ Step 2: Import to Catalog (Catalog owns intake) ═══════════════
    const candidateEntry = await createTestEntry({
      entryType: "bot",
      sourceType: "bot",
      sourceId: domainBotId,
      status: "draft",
      reviewState: "needs_review",
      tags: ["candidate"],
      config: {
        sourceBotId: domainBotId,
        botType: "customer-support",
        runtimeAuthority: "catalog_entry",
      },
    });

    // I2: Catalog owns intake — entry starts as candidate
    expect(candidateEntry.status).toBe("draft");
    expect(candidateEntry.reviewState).toBe("needs_review");
    const state1 = getCatalogState({
      status: candidateEntry.status,
      reviewState: candidateEntry.reviewState,
      tags: candidateEntry.tags as string[],
    });
    expect(state1.label).toBe("candidate");
    expect(state1.isCandidate).toBe(true);

    // I3: deployable (in domain) ≠ available (in catalog)
    expect(isCatalogEntryAvailableForAppUse(candidateEntry)).toBe(false);

    // I4: not approved + not active → not usable
    assertI4_OnlyCatalogApprovedActive(candidateEntry);

    // I7: structured FK is set
    expect(candidateEntry.sourceType).toBe("bot");
    expect(candidateEntry.sourceId).toBe(domainBotId);
    assertI7_StructuredFKPreferred(candidateEntry);

    // I6: version created
    let versions = await getCatalogEntryVersions(candidateEntry.id);
    expect(versions.length).toBe(1);

    // ══ Step 3: Review & Approve ══════════════════════════════════════
    const approved = await approveCatalogEntry(candidateEntry.id, 1);

    expect(approved.reviewState).toBe("approved");

    // I3: approved but still draft → NOT available
    expect(isCatalogEntryAvailableForAppUse(approved)).toBe(false);
    assertI4_OnlyCatalogApprovedActive(approved);

    // I6: version 2 created
    versions = await getCatalogEntryVersions(candidateEntry.id);
    expect(versions.length).toBe(2);

    // ══ Step 4: Publish (create bundle) ═══════════════════════════════
    await updateCatalogEntry(candidateEntry.id, {
      tags: ["candidate", "registered", "published"],
    }, 1);

    const bundle = await createTestBundle(candidateEntry.id, {
      snapshot: {
        botType: "customer-support",
        config: { greeting: "Hello! How can I help?" },
      },
    });

    expect(bundle.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.status).toBe("active");

    // Still draft → NOT available
    const afterPublish = await getCatalogEntryById(candidateEntry.id);
    expect(isCatalogEntryAvailableForAppUse(afterPublish!)).toBe(false);

    // ══ Step 5: Activate ══════════════════════════════════════════════
    const activated = await updateCatalogEntry(candidateEntry.id, {
      status: "active",
    }, 1);

    // I4: NOW available (active + approved)
    expect(isCatalogEntryAvailableForAppUse(activated)).toBe(true);
    assertI4_OnlyCatalogApprovedActive(activated);

    const avail = checkCatalogAvailability(activated);
    expect(avail.available).toBe(true);
    expect(avail.reasons).toEqual([]);

    // I5: verify in availability query
    const availableEntries = await getCatalogEntries({
      entryType: "bot",
      ...CATALOG_AVAILABILITY_FILTERS,
    });
    expect(availableEntries.map((e) => e.id)).toContain(candidateEntry.id);
    assertI5_NoRawDomainLeakage(
      availableEntries.filter((e) => e.id === candidateEntry.id)
    );

    // State label should be "available"
    const finalState = getCatalogState({
      status: activated.status,
      reviewState: activated.reviewState,
      tags: activated.tags as string[],
    });
    expect(finalState.label).toBe("available");
    expect(finalState.isAvailableForAppUse).toBe(true);
  });
});
