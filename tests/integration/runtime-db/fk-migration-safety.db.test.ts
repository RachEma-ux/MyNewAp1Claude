/**
 * LAYER 3 — FK Migration Safety — Real DB Integration Tests
 *
 * SCENARIO 5: Mixed Legacy + Structured FK Migration Safety
 *
 * Validates that entries with both old-style config.sourceModelId and
 * new-style sourceType/sourceId columns are handled correctly:
 * - Structured FK is populated on new entries
 * - Legacy fallback works for old entries
 * - Duplicate detection handles both formats
 * - Enriched lookup prefers structured FK
 *
 * Requires DATABASE_URL to be set.
 */

import { describe, it, expect, afterEach } from "vitest";
import { hasDb, cleanup, createTestEntry } from "./helpers/db-harness";
import { getCatalogEntries, getCatalogEntryById } from "../../../server/db/catalog";

describe.runIf(hasDb)("FK Migration Safety — Real DB (Scenario 5)", () => {
  afterEach(async () => {
    await cleanup();
  });

  // ==========================================================================
  // Structured FK population
  // ==========================================================================

  it("new entries populate sourceType and sourceId columns", async () => {
    const entry = await createTestEntry({
      entryType: "model",
      sourceType: "model",
      sourceId: 42,
      config: { sourceModelId: 42, runtimeAuthority: "catalog_entry" },
    });

    const dbEntry = await getCatalogEntryById(entry.id);
    expect(dbEntry).not.toBeNull();
    expect(dbEntry!.sourceType).toBe("model");
    expect(dbEntry!.sourceId).toBe(42);
  });

  // ==========================================================================
  // Legacy entries (no structured FK)
  // ==========================================================================

  it("legacy entries without structured FK still have config.sourceId", async () => {
    const legacyEntry = await createTestEntry({
      entryType: "model",
      sourceType: null as any,
      sourceId: null as any,
      config: { sourceModelId: 99, runtimeAuthority: "catalog_entry" },
    });

    const dbEntry = await getCatalogEntryById(legacyEntry.id);
    expect(dbEntry!.sourceType).toBeNull();
    expect(dbEntry!.sourceId).toBeNull();
    const config = dbEntry!.config as Record<string, unknown>;
    expect(config.sourceModelId).toBe(99);
  });

  // ==========================================================================
  // Enriched lookup: FK preferred over legacy
  // ==========================================================================

  it("enriched lookup resolves structured FK first, then legacy", async () => {
    const sourceId = Math.floor(Math.random() * 100000) + 10000;

    // Create structured FK entry
    const structuredEntry = await createTestEntry({
      entryType: "bot",
      sourceType: "bot",
      sourceId,
      config: { sourceBotId: sourceId },
    });

    // Create legacy-only entry with different sourceId
    const legacySourceId = sourceId + 1;
    const legacyEntry = await createTestEntry({
      entryType: "bot",
      sourceType: null as any,
      sourceId: null as any,
      config: { sourceBotId: legacySourceId },
    });

    // Simulate enriched lookup (same logic as bots.listEnriched)
    const allBotEntries = await getCatalogEntries({ entryType: "bot" });

    const bySourceId = new Map<number, any>();
    const byLegacyId = new Map<number, any>();

    for (const entry of allBotEntries) {
      if (entry.sourceType === "bot" && entry.sourceId) {
        bySourceId.set(entry.sourceId, entry);
      }
      const config = (entry.config as Record<string, any>) || {};
      if (config.sourceBotId) {
        byLegacyId.set(config.sourceBotId, entry);
      }
    }

    // Structured FK should resolve for sourceId
    const resolved = bySourceId.get(sourceId) ?? byLegacyId.get(sourceId) ?? null;
    expect(resolved).not.toBeNull();
    expect(resolved.id).toBe(structuredEntry.id);

    // Legacy should resolve for legacySourceId
    const legacyResolved = bySourceId.get(legacySourceId) ?? byLegacyId.get(legacySourceId) ?? null;
    expect(legacyResolved).not.toBeNull();
    expect(legacyResolved.id).toBe(legacyEntry.id);
  });

  // ==========================================================================
  // Duplicate detection across both FK formats
  // ==========================================================================

  it("duplicate detection finds entries via structured FK", async () => {
    const sourceId = Math.floor(Math.random() * 100000) + 20000;

    const entry = await createTestEntry({
      entryType: "agent",
      sourceType: "agent",
      sourceId,
    });

    const allEntries = await getCatalogEntries({ entryType: "agent" });
    const duplicate = allEntries.find((e) => {
      if (e.sourceType === "agent" && e.sourceId === sourceId) return true;
      return false;
    });

    expect(duplicate).not.toBeNull();
    expect(duplicate!.id).toBe(entry.id);
  });

  it("duplicate detection finds entries via legacy config", async () => {
    const sourceId = Math.floor(Math.random() * 100000) + 30000;

    const entry = await createTestEntry({
      entryType: "model",
      sourceType: null as any,
      sourceId: null as any,
      config: { sourceModelId: sourceId },
    });

    const allEntries = await getCatalogEntries({ entryType: "model" });
    const duplicate = allEntries.find((e) => {
      const config = (e.config as Record<string, any>) || {};
      return config.sourceModelId === sourceId;
    });

    expect(duplicate).not.toBeNull();
    expect(duplicate!.id).toBe(entry.id);
  });

  // ==========================================================================
  // No false positives: different sources don't match
  // ==========================================================================

  it("entries with different sourceIds do not falsely match", async () => {
    const entry1 = await createTestEntry({
      entryType: "provider",
      sourceType: "provider",
      sourceId: 111,
    });

    const entry2 = await createTestEntry({
      entryType: "provider",
      sourceType: "provider",
      sourceId: 222,
    });

    const allEntries = await getCatalogEntries({ entryType: "provider" });

    // Looking for sourceId=111 should find entry1, not entry2
    const match = allEntries.find((e) => e.sourceType === "provider" && e.sourceId === 111);
    expect(match).not.toBeNull();
    expect(match!.id).toBe(entry1.id);
    expect(match!.id).not.toBe(entry2.id);
  });
});
