/**
 * Agent 7 — Intake Selector Tests
 *
 * Validates that source-domain selectors (intake) correctly distinguish
 * between deployable domain entities and catalog-available entries.
 *
 * Source selectors pick from domain tables (for import into Catalog).
 * They must NOT use catalog availability — that's the app-usage family.
 *
 * Invariants validated: I1, I2, I3
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  hasDb,
  cleanup,
  createTestEntry,
  assertI4_OnlyCatalogApprovedActive,
} from "../../helpers/governance-harness";
import {
  getCatalogEntries,
  getCatalogEntryById,
} from "../../../server/ai-types/public-api";
import { isCatalogEntryAvailableForAppUse } from "../../../server/ai-types/availability";
import { getCatalogState } from "../../../shared/catalog-state";

describe.runIf(hasDb)("Intake Selector — Source Domain Selectors", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("I2: imported entry starts in candidate state, not available", async () => {
    // Simulate: domain selector picks a deployable entity for import
    const imported = await createTestEntry({
      entryType: "model",
      sourceType: "model",
      sourceId: 12345,
      status: "draft",
      reviewState: "needs_review",
      tags: ["candidate"],
      config: { domainStatus: "ready" },
    });

    // I2: Catalog owns intake — starts as candidate
    const state = getCatalogState({
      status: imported.status,
      reviewState: imported.reviewState,
      tags: imported.tags as string[],
    });
    expect(state.label).toBe("candidate");
    expect(state.isCandidate).toBe(true);

    // I3: deployable ≠ available
    expect(isCatalogEntryAvailableForAppUse(imported)).toBe(false);
  });

  it("I3: domain 'ready' status does not make catalog entry available", async () => {
    // Domain says "ready" (deployable), but catalog says "draft" + "needs_review"
    const entry = await createTestEntry({
      entryType: "agent",
      status: "draft",
      reviewState: "needs_review",
      config: { domainStatus: "ready", capabilities: ["chat", "tools"] },
    });

    // I3: deployable ≠ available
    expect(isCatalogEntryAvailableForAppUse(entry)).toBe(false);
    assertI4_OnlyCatalogApprovedActive(entry);
  });

  it("I1: intake creates catalog entry for each domain type", async () => {
    const types = ["agent", "model", "bot", "llm", "provider"] as const;

    for (const entryType of types) {
      const entry = await createTestEntry({
        entryType,
        sourceType: entryType,
        sourceId: Math.floor(Math.random() * 100000) + 1,
        status: "draft",
        reviewState: "needs_review",
        tags: ["candidate"],
      });

      expect(entry.entryType).toBe(entryType);
      expect(entry.sourceType).toBe(entryType);

      // Verify in DB
      const dbEntry = await getCatalogEntryById(entry.id);
      expect(dbEntry).not.toBeNull();
      expect(dbEntry!.entryType).toBe(entryType);
    }
  });

  it("intake selector: catalog entries with different origins coexist", async () => {
    const admin = await createTestEntry({
      entryType: "provider",
      origin: "admin",
      status: "draft",
      reviewState: "needs_review",
    });

    const discovery = await createTestEntry({
      entryType: "provider",
      origin: "discovery",
      status: "draft",
      reviewState: "needs_review",
    });

    expect(admin.origin).toBe("admin");
    expect(discovery.origin).toBe("discovery");
    expect(admin.id).not.toBe(discovery.id);
  });
});
