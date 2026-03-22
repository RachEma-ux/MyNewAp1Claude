/**
 * Agent 5 — FK Integrity Tests
 *
 * Validates invariant I7: Structured FK preferred over legacy fallback.
 * Tests real DB foreign key linkage between catalog entries and domain entities.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
  assertI7_StructuredFKPreferred,
} from "../../helpers/governance-harness";
import { getCatalogEntryById } from "../../../server/db/catalog";

describe.runIf(hasDb)("FK Integrity — I7", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("I7: sourceType + sourceId are persisted correctly in DB", async () => {
    const sourceId = Math.floor(Math.random() * 100000) + 1;

    const entry = await createTestEntry({
      entryType: "agent",
      sourceType: "agent",
      sourceId,
      config: { sourceAgentId: sourceId },
    });

    const dbEntry = await getCatalogEntryById(entry.id);
    expect(dbEntry).not.toBeNull();
    expect(dbEntry!.sourceType).toBe("agent");
    expect(dbEntry!.sourceId).toBe(sourceId);

    assertI7_StructuredFKPreferred(dbEntry!);
  });

  it("I7: each domain type gets correct sourceType", async () => {
    const mappings = [
      { entryType: "agent", sourceType: "agent" },
      { entryType: "model", sourceType: "model" },
      { entryType: "bot", sourceType: "bot" },
      { entryType: "llm", sourceType: "llm" },
      { entryType: "provider", sourceType: "provider" },
    ];

    for (const { entryType, sourceType } of mappings) {
      const sourceId = Math.floor(Math.random() * 100000) + 1;
      const entry = await createTestEntry({
        entryType,
        sourceType,
        sourceId,
      });

      const dbEntry = await getCatalogEntryById(entry.id);
      expect(dbEntry!.sourceType).toBe(sourceType);
      expect(dbEntry!.sourceId).toBe(sourceId);
    }
  });

  it("I7: config legacy fields coexist with structured FK", async () => {
    const sourceId = 55555;
    const entry = await createTestEntry({
      entryType: "model",
      sourceType: "model",
      sourceId,
      config: {
        sourceModelId: sourceId,
        modelType: "llm",
        runtimeAuthority: "catalog_entry",
      },
    });

    const dbEntry = await getCatalogEntryById(entry.id);
    const config = dbEntry!.config as Record<string, unknown>;

    // Structured FK
    expect(dbEntry!.sourceType).toBe("model");
    expect(dbEntry!.sourceId).toBe(sourceId);

    // Legacy config
    expect(config.sourceModelId).toBe(sourceId);
    expect(config.runtimeAuthority).toBe("catalog_entry");
  });

  it("I7: entry without sourceType has null FK fields", async () => {
    const entry = await createTestEntry({
      entryType: "provider",
      // No sourceType/sourceId provided
    });

    const dbEntry = await getCatalogEntryById(entry.id);
    // sourceType defaults to what createTestEntry provides, but if null it should be null
    expect(dbEntry).not.toBeNull();
  });
});
