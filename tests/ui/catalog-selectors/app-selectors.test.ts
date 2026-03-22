/**
 * Agent 8 — App Selector Tests
 *
 * Validates that app-usage selectors (catalog selectors) return ONLY
 * Catalog-authoritative available entries for runtime use.
 *
 * Invariants validated: I4, I5
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
  assertI5_NoRawDomainLeakage,
} from "../../helpers/governance-harness";
import {
  getCatalogEntries,
} from "../../../server/db/catalog";
import {
  isCatalogEntryAvailableForAppUse,
  CATALOG_AVAILABILITY_FILTERS,
} from "../../../server/catalog/availability";

describe.runIf(hasDb)("App Selectors — Catalog-Backed", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("I5: app selector returns only active+approved entries", async () => {
    const available = await createTestEntry({
      entryType: "agent",
      status: "active",
      reviewState: "approved",
    });

    const notAvailable = await createTestEntry({
      entryType: "agent",
      status: "draft",
      reviewState: "needs_review",
    });

    const results = await getCatalogEntries({
      entryType: "agent",
      ...CATALOG_AVAILABILITY_FILTERS,
    });

    const ids = results.map((r) => r.id);
    expect(ids).toContain(available.id);
    expect(ids).not.toContain(notAvailable.id);

    // I5: validate structure
    assertI5_NoRawDomainLeakage(results.filter((r) => r.id === available.id));
  });

  it("I5: app selector filters by entryType correctly", async () => {
    const agent = await createTestEntry({ entryType: "agent", status: "active", reviewState: "approved" });
    const model = await createTestEntry({ entryType: "model", status: "active", reviewState: "approved" });

    const agentResults = await getCatalogEntries({
      entryType: "agent",
      ...CATALOG_AVAILABILITY_FILTERS,
    });
    const modelResults = await getCatalogEntries({
      entryType: "model",
      ...CATALOG_AVAILABILITY_FILTERS,
    });

    expect(agentResults.map((r) => r.id)).toContain(agent.id);
    expect(agentResults.map((r) => r.id)).not.toContain(model.id);
    expect(modelResults.map((r) => r.id)).toContain(model.id);
    expect(modelResults.map((r) => r.id)).not.toContain(agent.id);
  });

  it("I5: app selector returns entries with complete metadata", async () => {
    const entry = await createTestEntry({
      entryType: "bot",
      status: "active",
      reviewState: "approved",
      config: { greeting: "Hello", botType: "support" },
      tags: ["candidate", "published"],
      category: "customer_support",
    });

    const results = await getCatalogEntries({
      entryType: "bot",
      ...CATALOG_AVAILABILITY_FILTERS,
    });

    const found = results.find((r) => r.id === entry.id);
    expect(found).toBeDefined();
    expect(found!.name).toBeTruthy();
    expect(found!.entryType).toBe("bot");
    expect(found!.status).toBe("active");
    expect(found!.reviewState).toBe("approved");
  });

  it("I4: helper function agrees with DB filter for all entries", async () => {
    const entries = [
      await createTestEntry({ entryType: "provider", status: "active", reviewState: "approved" }),
      await createTestEntry({ entryType: "provider", status: "draft", reviewState: "approved" }),
      await createTestEntry({ entryType: "provider", status: "active", reviewState: "rejected" }),
    ];

    const dbResults = await getCatalogEntries({
      entryType: "provider",
      ...CATALOG_AVAILABILITY_FILTERS,
    });
    const dbIds = new Set(dbResults.map((r) => r.id));

    for (const e of entries) {
      const helperResult = isCatalogEntryAvailableForAppUse(e);
      expect(dbIds.has(e.id)).toBe(helperResult);
    }
  });
});
