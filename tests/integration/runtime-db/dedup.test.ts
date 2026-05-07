/**
 * Agent 5 — Dedup Tests
 *
 * Validates duplicate detection and prevention at the DB level.
 * The system allows multiple entries with same source linkage
 * (application-level dedup, not DB constraint).
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
} from "../../helpers/governance-harness";
import { getCatalogEntries, getCatalogEntryById } from "../../../server/ai-types/public-api";

describe.runIf(hasDb)("Dedup Safety — DB Level", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("DB allows multiple entries with same sourceType + sourceId", async () => {
    const e1 = await createTestEntry({
      entryType: "agent",
      sourceType: "agent",
      sourceId: 999,
    });

    const e2 = await createTestEntry({
      entryType: "agent",
      sourceType: "agent",
      sourceId: 999,
    });

    expect(e1.id).not.toBe(e2.id);
    expect(e1.sourceId).toBe(999);
    expect(e2.sourceId).toBe(999);
  });

  it("application-level dedup: can filter duplicates by sourceType+sourceId", async () => {
    const sourceId = Math.floor(Math.random() * 100000) + 1;

    await createTestEntry({ entryType: "model", sourceType: "model", sourceId });
    await createTestEntry({ entryType: "model", sourceType: "model", sourceId });
    await createTestEntry({ entryType: "model", sourceType: "model", sourceId });

    const all = await getCatalogEntries({ entryType: "model" });
    const dupes = all.filter((e) => e.sourceType === "model" && e.sourceId === sourceId);

    // All three exist
    expect(dupes.length).toBeGreaterThanOrEqual(3);

    // Application would pick the first/latest — dedup is app-level
    const uniqueIds = new Set(dupes.map((d) => d.id));
    expect(uniqueIds.size).toBe(dupes.length); // All have unique catalog IDs
  });

  it("entries with same name but different types are not duplicates", async () => {
    const name = `__test_shared_name_${Date.now()}`;

    const agent = await createTestEntry({ entryType: "agent", name });
    const model = await createTestEntry({ entryType: "model", name });

    expect(agent.id).not.toBe(model.id);
    expect(agent.name).toBe(name);
    expect(model.name).toBe(name);
    expect(agent.entryType).toBe("agent");
    expect(model.entryType).toBe("model");
  });
});
