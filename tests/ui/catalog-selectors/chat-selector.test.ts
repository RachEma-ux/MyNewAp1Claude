/**
 * Agent 9 — Chat Selector Tests
 *
 * Validates that chat model/LLM selectors use Catalog availability.
 * In the real app, chat selectors pick from catalogManage.available endpoint.
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
  CATALOG_AVAILABILITY_FILTERS,
} from "../../../server/catalog/availability";

describe.runIf(hasDb)("Chat Selector — LLM/Model Availability", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("I5: chat selector only shows available LLMs", async () => {
    const activeLLM = await createTestEntry({
      entryType: "llm",
      status: "active",
      reviewState: "approved",
      config: { model: "gpt-4", provider: "openai" },
    });

    const draftLLM = await createTestEntry({
      entryType: "llm",
      status: "draft",
      reviewState: "needs_review",
      config: { model: "pending-model" },
    });

    const results = await getCatalogEntries({
      entryType: "llm",
      ...CATALOG_AVAILABILITY_FILTERS,
    });

    const ids = results.map((r) => r.id);
    expect(ids).toContain(activeLLM.id);
    expect(ids).not.toContain(draftLLM.id);

    assertI5_NoRawDomainLeakage(results.filter((r) => r.id === activeLLM.id));
  });

  it("I5: chat selector shows available models from multiple providers", async () => {
    const model1 = await createTestEntry({
      entryType: "model",
      status: "active",
      reviewState: "approved",
      config: { provider: "openai", model: "gpt-4" },
    });

    const model2 = await createTestEntry({
      entryType: "model",
      status: "active",
      reviewState: "approved",
      config: { provider: "anthropic", model: "claude-3" },
    });

    const rejected = await createTestEntry({
      entryType: "model",
      status: "active",
      reviewState: "rejected",
      config: { provider: "blocked", model: "blocked-model" },
    });

    const results = await getCatalogEntries({
      entryType: "model",
      ...CATALOG_AVAILABILITY_FILTERS,
    });

    const ids = results.map((r) => r.id);
    expect(ids).toContain(model1.id);
    expect(ids).toContain(model2.id);
    expect(ids).not.toContain(rejected.id);
  });
});
