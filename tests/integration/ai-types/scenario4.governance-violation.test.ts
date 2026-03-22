/**
 * Agent 6 — Scenario 4: Governance Violation Detection
 *
 * Tests that invalid transitions are blocked and audit is enforced.
 * Attempts every violation pattern and verifies the system resists it.
 *
 * Invariants validated: I4, I6
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
  assertI4_OnlyCatalogApprovedActive,
} from "../../helpers/governance-harness";
import {
  getCatalogEntries,
  getCatalogEntryById,
  updateCatalogEntry,
  getCatalogEntryVersions,
} from "../../../server/db/catalog";
import {
  isCatalogEntryAvailableForAppUse,
  checkCatalogAvailability,
  CATALOG_AVAILABILITY_FILTERS,
} from "../../../server/catalog/availability";

describe.runIf(hasDb)("Scenario 4 — Governance Violation Detection", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("violation: force-activating a rejected entry does NOT make it available", async () => {
    const entry = await createTestEntry({
      entryType: "agent",
      status: "draft",
      reviewState: "rejected",
    });

    // Force activate
    const forced = await updateCatalogEntry(entry.id, { status: "active" }, 1);

    // I4: rejected + active → NOT available
    assertI4_OnlyCatalogApprovedActive(forced);
    expect(isCatalogEntryAvailableForAppUse(forced)).toBe(false);

    const avail = checkCatalogAvailability(forced);
    expect(avail.available).toBe(false);
    expect(avail.reasons.some((r) => r.includes("rejected"))).toBe(true);

    // Must NOT appear in runtime queries
    const results = await getCatalogEntries({
      entryType: "agent",
      ...CATALOG_AVAILABILITY_FILTERS,
    });
    expect(results.map((r) => r.id)).not.toContain(entry.id);
  });

  it("violation: deprecating active+approved removes from runtime", async () => {
    const entry = await createTestEntry({
      entryType: "model",
      status: "active",
      reviewState: "approved",
    });

    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(true);

    const deprecated = await updateCatalogEntry(entry.id, { status: "deprecated" }, 1);
    expect(isCatalogEntryAvailableForAppUse(deprecated)).toBe(false);

    const avail = checkCatalogAvailability(deprecated);
    expect(avail.reasons.some((r) => r.includes("deprecated"))).toBe(true);
  });

  it("I6: every governance transition creates version records", async () => {
    const entry = await createTestEntry({
      entryType: "llm",
      status: "draft",
      reviewState: "needs_review",
    });

    let versions = await getCatalogEntryVersions(entry.id);
    expect(versions.length).toBe(1); // creation

    await updateCatalogEntry(entry.id, { reviewState: "approved" }, 1);
    versions = await getCatalogEntryVersions(entry.id);
    expect(versions.length).toBe(2);

    await updateCatalogEntry(entry.id, { status: "active" }, 1);
    versions = await getCatalogEntryVersions(entry.id);
    expect(versions.length).toBe(3);

    await updateCatalogEntry(entry.id, { status: "deprecated" }, 1);
    versions = await getCatalogEntryVersions(entry.id);
    expect(versions.length).toBe(4);

    // Full audit trail maintained
    expect(versions[0].version).toBe(4);
    expect(versions[3].version).toBe(1);
  });

  it("multiple concurrent violations all blocked independently", async () => {
    const entries = await Promise.all([
      createTestEntry({ entryType: "bot", status: "active", reviewState: "rejected" }),
      createTestEntry({ entryType: "bot", status: "deprecated", reviewState: "approved" }),
      createTestEntry({ entryType: "bot", status: "disabled", reviewState: "approved" }),
      createTestEntry({ entryType: "bot", status: "draft", reviewState: "needs_review" }),
    ]);

    // None should be available
    for (const e of entries) {
      expect(isCatalogEntryAvailableForAppUse(e)).toBe(false);
      assertI4_OnlyCatalogApprovedActive(e);
    }

    // Zero results in availability filter for these entries
    const available = await getCatalogEntries({
      entryType: "bot",
      ...CATALOG_AVAILABILITY_FILTERS,
    });
    const availIds = new Set(available.map((a) => a.id));
    for (const e of entries) {
      expect(availIds.has(e.id)).toBe(false);
    }
  });
});
