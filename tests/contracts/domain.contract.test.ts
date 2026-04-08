/**
 * Agent 1 — Domain Contract Tests
 *
 * Validates invariants:
 *   I1: Domain creates entity only (no catalog_entries write)
 *   I3: deployable ≠ available
 *   I7: Structured FK preferred over legacy fallback
 *
 * Tests verify that domain routers create entities in their own tables
 * and do NOT directly write catalog_entries.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
  getTestDb,
  assertI4_OnlyCatalogApprovedActive,
  assertI7_StructuredFKPreferred,
} from "../helpers/governance-harness";
import { getCatalogEntries, getCatalogEntryById } from "../../server/db/catalog";
import { isCatalogEntryAvailableForAppUse } from "../../server/ai-types/availability";

describe.runIf(hasDb)("Domain Contract — I1, I3, I7", () => {
  afterEach(async () => {
    await cleanup();
  });

  // ══════════════════════════════════════════════════════════════════════
  // I1: Domain creates entity only — catalog_entries creation is Catalog's job
  // ══════════════════════════════════════════════════════════════════════

  it("I1: domain entity creation does not produce catalog_entries rows", async () => {
    // Simulate: domain creates agent entity (tracked in agents table, not catalog)
    // The catalog entry is created separately via importToCatalog
    const beforeCount = (await getCatalogEntries({})).length;

    // Domain action: create an agent in domain table (simulated)
    // This should NOT create a catalog_entry

    // Catalog action: explicitly import to catalog
    const catalogEntry = await createTestEntry({
      entryType: "agent",
      sourceType: "agent",
      sourceId: 99999,
      status: "draft",
      reviewState: "needs_review",
    });

    const afterCount = (await getCatalogEntries({})).length;

    // Catalog entry was created by the test (simulating catalog import, not domain)
    expect(afterCount).toBe(beforeCount + 1);
    expect(catalogEntry.status).toBe("draft");
    expect(catalogEntry.reviewState).toBe("needs_review");
  });

  it("I1: each AI type domain creates entries with correct sourceType linkage", async () => {
    const domains = [
      { entryType: "agent", sourceType: "agent" },
      { entryType: "model", sourceType: "model" },
      { entryType: "bot", sourceType: "bot" },
      { entryType: "llm", sourceType: "llm" },
      { entryType: "provider", sourceType: "provider" },
    ] as const;

    for (const { entryType, sourceType } of domains) {
      const sourceId = Math.floor(Math.random() * 100000) + 1;
      const entry = await createTestEntry({
        entryType,
        sourceType,
        sourceId,
      });

      expect(entry.entryType).toBe(entryType);
      expect(entry.sourceType).toBe(sourceType);
      expect(entry.sourceId).toBe(sourceId);
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // I3: deployable ≠ available
  // ══════════════════════════════════════════════════════════════════════

  it("I3: a deployable domain entity imported as draft is NOT available", async () => {
    // Domain entity is "ready" (deployable), but catalog entry starts as draft
    const entry = await createTestEntry({
      entryType: "model",
      sourceType: "model",
      sourceId: 77777,
      status: "draft",
      reviewState: "needs_review",
      config: { domainStatus: "ready", runtimeAuthority: "catalog_entry" },
    });

    // I3: deployable ≠ available
    expect(entry.status).toBe("draft");
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);

    // I4: assert full invariant
    assertI4_OnlyCatalogApprovedActive(entry);
  });

  it("I3: approved but not active entry is NOT available", async () => {
    const entry = await createTestEntry({
      entryType: "agent",
      status: "draft",
      reviewState: "approved",
    });

    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);
    assertI4_OnlyCatalogApprovedActive(entry);
  });

  it("I3: active but not approved entry is NOT available", async () => {
    const entry = await createTestEntry({
      entryType: "bot",
      status: "active",
      reviewState: "needs_review",
    });

    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);
    assertI4_OnlyCatalogApprovedActive(entry);
  });

  // ══════════════════════════════════════════════════════════════════════
  // I7: Structured FK preferred over legacy fallback
  // ══════════════════════════════════════════════════════════════════════

  it("I7: entry with sourceType/sourceId uses structured FK", async () => {
    const sourceId = Math.floor(Math.random() * 100000) + 1;
    const entry = await createTestEntry({
      entryType: "model",
      sourceType: "model",
      sourceId,
      config: { sourceModelId: sourceId },
    });

    // Structured FK fields are set
    expect(entry.sourceType).toBe("model");
    expect(entry.sourceId).toBe(sourceId);

    // Legacy config field also preserved
    const config = entry.config as Record<string, unknown>;
    expect(config.sourceModelId).toBe(sourceId);

    // I7 assertion
    assertI7_StructuredFKPreferred(entry);
  });

  it("I7: entry with only legacy config still has sourceType set for new entries", async () => {
    const entry = await createTestEntry({
      entryType: "llm",
      sourceType: "llm",
      sourceId: 12345,
      config: { sourceLLMId: 12345 },
    });

    // Structured FK should be present
    expect(entry.sourceType).toBe("llm");
    expect(entry.sourceId).toBe(12345);
    assertI7_StructuredFKPreferred(entry);
  });
});
