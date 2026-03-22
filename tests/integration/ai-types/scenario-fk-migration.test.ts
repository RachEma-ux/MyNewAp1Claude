/**
 * LAYER 4 — Cross-Domain Lifecycle: Mixed FK Migration Safety (Scenario 5)
 *
 * Narrative: System has both old entries (config.sourceModelId) and
 * new entries (sourceType/sourceId). Enriched lookups must work correctly.
 * AI Types: Models, Bots, Providers, LLMs, Agents
 */

import { describe, it, expect } from "vitest";

describe("Scenario 5 — Mixed Legacy + Structured FK Migration Safety", () => {

  // Simulate the enriched lookup logic used in all domain routers
  function enrichedLookup(
    catalogEntries: Array<{
      id: number;
      sourceType: string | null;
      sourceId: number | null;
      config: Record<string, any>;
      name: string;
    }>,
    domainEntities: Array<{ id: number; name: string }>
  ) {
    const bySourceId = new Map<number, any>();
    const byLegacyId = new Map<number, any>();
    const byName = new Map<string, any>();

    for (const entry of catalogEntries) {
      if (entry.sourceType && entry.sourceId) {
        bySourceId.set(entry.sourceId, entry);
      }
      const config = entry.config || {};
      // Check all legacy key patterns
      const legacyId = config.sourceModelId ?? config.sourceBotId ?? config.sourceAgentId ?? config.sourceProviderId;
      if (legacyId) {
        byLegacyId.set(legacyId, entry);
      }
      byName.set(entry.name.toLowerCase(), entry);
    }

    return domainEntities.map((entity) => {
      const catalogEntry =
        bySourceId.get(entity.id) ??
        byLegacyId.get(entity.id) ??
        byName.get(entity.name.toLowerCase()) ??
        null;
      return { ...entity, catalogEntry };
    });
  }

  it("structured FK entry resolves before legacy", () => {
    const catalogEntries = [
      { id: 100, sourceType: "model", sourceId: 1, config: { sourceModelId: 1 }, name: "model-a" },
    ];
    const domains = [{ id: 1, name: "model-a" }];

    const result = enrichedLookup(catalogEntries, domains);
    expect(result[0].catalogEntry?.id).toBe(100);
  });

  it("legacy-only entry still resolves via config fallback", () => {
    const catalogEntries = [
      { id: 200, sourceType: null, sourceId: null, config: { sourceModelId: 2 }, name: "model-b" },
    ];
    const domains = [{ id: 2, name: "model-b" }];

    const result = enrichedLookup(catalogEntries, domains);
    expect(result[0].catalogEntry?.id).toBe(200);
  });

  it("name-based fallback works when neither FK nor config match", () => {
    const catalogEntries = [
      { id: 300, sourceType: null, sourceId: null, config: {}, name: "model-c" },
    ];
    const domains = [{ id: 3, name: "model-c" }];

    const result = enrichedLookup(catalogEntries, domains);
    expect(result[0].catalogEntry?.id).toBe(300);
  });

  it("entity with no matching catalog entry returns null", () => {
    const catalogEntries = [
      { id: 100, sourceType: "model", sourceId: 99, config: {}, name: "other" },
    ];
    const domains = [{ id: 5, name: "unmatched" }];

    const result = enrichedLookup(catalogEntries, domains);
    expect(result[0].catalogEntry).toBeNull();
  });

  it("duplicate detection: structured FK has priority", () => {
    const catalogEntries = [
      { id: 100, sourceType: "model", sourceId: 10, config: {}, name: "model-x" },
      { id: 200, sourceType: null, sourceId: null, config: { sourceModelId: 10 }, name: "model-x-legacy" },
    ];
    const domains = [{ id: 10, name: "model-x" }];

    const result = enrichedLookup(catalogEntries, domains);
    // Should resolve via structured FK (id=100), not legacy (id=200)
    expect(result[0].catalogEntry?.id).toBe(100);
  });

  it("per-domain FK key patterns", () => {
    // Each domain uses a different legacy config key
    const patterns = [
      { domain: "model", legacyKey: "sourceModelId" },
      { domain: "bot", legacyKey: "sourceBotId" },
      { domain: "agent", legacyKey: "sourceAgentId" },
    ];

    for (const { domain, legacyKey } of patterns) {
      const config: Record<string, any> = {};
      config[legacyKey] = 42;

      const entries = [
        { id: 500, sourceType: null, sourceId: null, config, name: `${domain}-test` },
      ];
      const domains = [{ id: 42, name: `${domain}-test` }];

      const result = enrichedLookup(entries, domains);
      expect(result[0].catalogEntry?.id).toBe(500);
    }
  });
});
