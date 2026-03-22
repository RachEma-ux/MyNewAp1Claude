/**
 * Agent 5 — Legacy Fallback Tests
 *
 * Validates that legacy config-based FK fields still work as fallback
 * when structured FK is not available.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
} from "../../helpers/governance-harness";
import { getCatalogEntryById, getCatalogEntries } from "../../../server/db/catalog";

describe.runIf(hasDb)("Legacy Fallback — FK Resolution", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("config.sourceModelId serves as legacy FK for models", async () => {
    const entry = await createTestEntry({
      entryType: "model",
      config: { sourceModelId: 42, providerName: "test-provider" },
    });

    const dbEntry = await getCatalogEntryById(entry.id);
    const config = dbEntry!.config as Record<string, unknown>;
    expect(config.sourceModelId).toBe(42);
  });

  it("config.sourceLLMId serves as legacy FK for LLMs", async () => {
    const entry = await createTestEntry({
      entryType: "llm",
      config: { sourceLLMId: 77, versionId: "v2.0" },
    });

    const dbEntry = await getCatalogEntryById(entry.id);
    const config = dbEntry!.config as Record<string, unknown>;
    expect(config.sourceLLMId).toBe(77);
  });

  it("config.sourceAgentId serves as legacy FK for agents", async () => {
    const entry = await createTestEntry({
      entryType: "agent",
      config: { sourceAgentId: 101 },
    });

    const dbEntry = await getCatalogEntryById(entry.id);
    const config = dbEntry!.config as Record<string, unknown>;
    expect(config.sourceAgentId).toBe(101);
  });

  it("config.sourceBotId serves as legacy FK for bots", async () => {
    const entry = await createTestEntry({
      entryType: "bot",
      config: { sourceBotId: 33, botType: "customer-support" },
    });

    const dbEntry = await getCatalogEntryById(entry.id);
    const config = dbEntry!.config as Record<string, unknown>;
    expect(config.sourceBotId).toBe(33);
  });
});
