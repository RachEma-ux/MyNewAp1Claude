/**
 * Agent 6 — Scenario 5: Legacy FK + Structured FK
 *
 * Tests FK resolution paths: structured (sourceType/sourceId)
 * vs legacy (config.sourceXxxId). Verifies dedup safety.
 *
 * Invariants validated: I7
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
  assertI7_StructuredFKPreferred,
} from "../../helpers/governance-harness";
import { getCatalogEntryById, getCatalogEntries } from "../../../server/db/catalog";

describe.runIf(hasDb)("Scenario 5 — Legacy FK + Structured FK", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("I7: structured FK is the primary resolution path", async () => {
    const sourceId = Math.floor(Math.random() * 100000) + 1;

    const entry = await createTestEntry({
      entryType: "agent",
      sourceType: "agent",
      sourceId,
      config: {
        sourceAgentId: sourceId,
        runtimeAuthority: "catalog_entry",
      },
    });

    const dbEntry = await getCatalogEntryById(entry.id);

    // Primary: structured FK
    expect(dbEntry!.sourceType).toBe("agent");
    expect(dbEntry!.sourceId).toBe(sourceId);

    // Legacy: config field (fallback)
    expect((dbEntry!.config as any).sourceAgentId).toBe(sourceId);

    assertI7_StructuredFKPreferred(dbEntry!);
  });

  it("I7: all five AI types support structured FK", async () => {
    const types = [
      { entryType: "agent", sourceType: "agent", configKey: "sourceAgentId" },
      { entryType: "model", sourceType: "model", configKey: "sourceModelId" },
      { entryType: "bot", sourceType: "bot", configKey: "sourceBotId" },
      { entryType: "llm", sourceType: "llm", configKey: "sourceLLMId" },
      { entryType: "provider", sourceType: "provider", configKey: "sourceProviderId" },
    ];

    for (const { entryType, sourceType, configKey } of types) {
      const sourceId = Math.floor(Math.random() * 100000) + 1;

      const entry = await createTestEntry({
        entryType,
        sourceType,
        sourceId,
        config: { [configKey]: sourceId },
      });

      const dbEntry = await getCatalogEntryById(entry.id);
      expect(dbEntry!.sourceType).toBe(sourceType);
      expect(dbEntry!.sourceId).toBe(sourceId);
      assertI7_StructuredFKPreferred(dbEntry!);
    }
  });

  it("dedup: same sourceId across different types creates separate entries", async () => {
    const sharedSourceId = 88888;

    const agentEntry = await createTestEntry({
      entryType: "agent",
      sourceType: "agent",
      sourceId: sharedSourceId,
    });

    const modelEntry = await createTestEntry({
      entryType: "model",
      sourceType: "model",
      sourceId: sharedSourceId,
    });

    expect(agentEntry.id).not.toBe(modelEntry.id);
    expect(agentEntry.sourceType).toBe("agent");
    expect(modelEntry.sourceType).toBe("model");
    expect(agentEntry.sourceId).toBe(sharedSourceId);
    expect(modelEntry.sourceId).toBe(sharedSourceId);
  });

  it("dedup: same sourceType+sourceId creates distinct catalog entries", async () => {
    const sourceId = Math.floor(Math.random() * 100000) + 1;

    const e1 = await createTestEntry({ entryType: "bot", sourceType: "bot", sourceId });
    const e2 = await createTestEntry({ entryType: "bot", sourceType: "bot", sourceId });

    // Both exist with unique IDs
    expect(e1.id).not.toBe(e2.id);

    // Both have same FK linkage
    expect(e1.sourceType).toBe("bot");
    expect(e2.sourceType).toBe("bot");
    expect(e1.sourceId).toBe(sourceId);
    expect(e2.sourceId).toBe(sourceId);
  });
});
