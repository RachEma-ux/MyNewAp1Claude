/**
 * Agent 9 — Bot Wizard Selector Tests
 *
 * Validates that bot creation wizard selectors use Catalog availability
 * for LLM/model assignment. The wizard must pick from catalog-available
 * entries, not raw domain tables.
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
} from "../../../server/ai-types/availability";

describe.runIf(hasDb)("Bot Wizard Selector — LLM Assignment", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("I5: bot wizard LLM picker only shows available LLMs", async () => {
    const available = await createTestEntry({
      entryType: "llm",
      status: "active",
      reviewState: "approved",
      config: { model: "gpt-4", capabilities: ["chat", "function-calling"] },
    });

    const pending = await createTestEntry({
      entryType: "llm",
      status: "draft",
      reviewState: "needs_review",
      config: { model: "new-model" },
    });

    const disabled = await createTestEntry({
      entryType: "llm",
      status: "disabled",
      reviewState: "approved",
      config: { model: "legacy-model" },
    });

    const results = await getCatalogEntries({
      entryType: "llm",
      ...CATALOG_AVAILABILITY_FILTERS,
    });

    const ids = results.map((r) => r.id);
    expect(ids).toContain(available.id);
    expect(ids).not.toContain(pending.id);
    expect(ids).not.toContain(disabled.id);

    assertI5_NoRawDomainLeakage(results.filter((r) => r.id === available.id));
  });

  it("I5: bot wizard provider picker only shows available providers", async () => {
    const activeProvider = await createTestEntry({
      entryType: "provider",
      status: "active",
      reviewState: "approved",
      config: { baseUrl: "https://api.openai.com" },
    });

    const deprecatedProvider = await createTestEntry({
      entryType: "provider",
      status: "deprecated",
      reviewState: "approved",
      config: { baseUrl: "https://old-api.example.com" },
    });

    const results = await getCatalogEntries({
      entryType: "provider",
      ...CATALOG_AVAILABILITY_FILTERS,
    });

    const ids = results.map((r) => r.id);
    expect(ids).toContain(activeProvider.id);
    expect(ids).not.toContain(deprecatedProvider.id);
  });

  it("I4: bot wizard cannot assign a non-available LLM", async () => {
    const rejectedLLM = await createTestEntry({
      entryType: "llm",
      status: "active",
      reviewState: "rejected",
    });

    // This LLM must not be available for assignment
    expect(isCatalogEntryAvailableForAppUse(rejectedLLM)).toBe(false);

    // Must not appear in selector
    const results = await getCatalogEntries({
      entryType: "llm",
      ...CATALOG_AVAILABILITY_FILTERS,
    });
    expect(results.map((r) => r.id)).not.toContain(rejectedLLM.id);
  });
});
