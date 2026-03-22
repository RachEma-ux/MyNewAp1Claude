/**
 * Agent 6 — Scenario 2: LLM Pipeline
 *
 * Tests LLM import into catalog with blocked vs deployable states,
 * override behavior, and import restrictions.
 *
 * Invariants validated: I1, I2, I3, I4, I5
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
  makeEntryAvailable,
  assertI4_OnlyCatalogApprovedActive,
} from "../../helpers/governance-harness";
import {
  getCatalogEntries,
  getCatalogEntryById,
  updateCatalogEntry,
  approveCatalogEntry,
} from "../../../server/db/catalog";
import {
  isCatalogEntryAvailableForAppUse,
  CATALOG_AVAILABILITY_FILTERS,
} from "../../../server/catalog/availability";
import { getCatalogState } from "../../../shared/catalog-state";

describe.runIf(hasDb)("Scenario 2 — LLM Pipeline", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("LLM import creates candidate, follows full lifecycle", async () => {
    const domainLLMId = Math.floor(Math.random() * 100000) + 1;

    // Step 1: Import LLM as catalog candidate
    const entry = await createTestEntry({
      entryType: "llm",
      sourceType: "llm",
      sourceId: domainLLMId,
      status: "draft",
      reviewState: "needs_review",
      tags: ["candidate"],
      config: {
        sourceLLMId: domainLLMId,
        model: "gpt-4",
        provider: "openai",
      },
    });

    // I2: starts as candidate
    expect(entry.status).toBe("draft");
    // I3: not available
    assertI4_OnlyCatalogApprovedActive(entry);

    // Step 2: Approve
    await approveCatalogEntry(entry.id, 1);
    const approved = await getCatalogEntryById(entry.id);
    assertI4_OnlyCatalogApprovedActive(approved!);
    expect(isCatalogEntryAvailableForAppUse(approved!)).toBe(false); // still draft

    // Step 3: Activate
    await updateCatalogEntry(entry.id, { status: "active" }, 1);
    const active = await getCatalogEntryById(entry.id);
    assertI4_OnlyCatalogApprovedActive(active!);
    expect(isCatalogEntryAvailableForAppUse(active!)).toBe(true);
  });

  it("blocked LLM (needs_review) cannot reach runtime", async () => {
    const entry = await createTestEntry({
      entryType: "llm",
      status: "active",
      reviewState: "needs_review",
      config: { model: "blocked-model" },
    });

    // Active but not approved → blocked from runtime
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);

    // Must NOT appear in availability filter
    const results = await getCatalogEntries({
      entryType: "llm",
      ...CATALOG_AVAILABILITY_FILTERS,
    });
    expect(results.map((r) => r.id)).not.toContain(entry.id);
  });

  it("LLM override: changing config preserves availability if state is maintained", async () => {
    const entry = await createTestEntry({
      entryType: "llm",
      status: "active",
      reviewState: "approved",
      config: { model: "gpt-3.5", temperature: 0.7 },
    });

    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(true);

    // Update config (override)
    const updated = await updateCatalogEntry(entry.id, {
      config: { model: "gpt-4", temperature: 0.3 },
    }, 1);

    // Still available — config change doesn't affect lifecycle
    expect(isCatalogEntryAvailableForAppUse(updated)).toBe(true);
    assertI4_OnlyCatalogApprovedActive(updated);
  });

  it("multiple LLM entries from same provider coexist independently", async () => {
    const e1 = await createTestEntry({
      entryType: "llm",
      status: "active",
      reviewState: "approved",
      config: { model: "gpt-4" },
    });

    const e2 = await createTestEntry({
      entryType: "llm",
      status: "draft",
      reviewState: "needs_review",
      config: { model: "gpt-3.5" },
    });

    // e1 available, e2 not
    expect(isCatalogEntryAvailableForAppUse(e1)).toBe(true);
    expect(isCatalogEntryAvailableForAppUse(e2)).toBe(false);

    // Changing e2 doesn't affect e1
    await updateCatalogEntry(e2.id, { status: "active", reviewState: "approved" }, 1);
    const e1_recheck = await getCatalogEntryById(e1.id);
    expect(isCatalogEntryAvailableForAppUse(e1_recheck!)).toBe(true);
  });
});
