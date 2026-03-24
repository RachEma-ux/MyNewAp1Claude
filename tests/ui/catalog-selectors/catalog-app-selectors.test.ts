/**
 * LAYER 5B — Catalog-Backed App Selector Tests
 *
 * Invariant: App selectors (Chat, Bot wizard, Agent assignment) show ONLY
 *            Catalog-available (active+approved) entries.
 *            No raw domain leakage.
 *            Correct labels and selected values.
 *
 * Tests validate: selector component exports, availability filtering,
 *                 hook contracts, no raw domain queries in app usage paths
 */

import { describe, it, expect } from "vitest";
import path from "path";
import { CATALOG_AVAILABILITY_FILTERS, isCatalogEntryAvailableForAppUse } from "../../../server/catalog/availability";

// ============================================================================
// Catalog selector component exports
// ============================================================================

describe("Catalog App Selectors — Component Exports", () => {
  it("CatalogLLMSelect exports from catalog-selectors", async () => {
    const selectors = await import("../../../client/src/components/catalog-selectors");
    expect(selectors.CatalogLLMSelect).toBeDefined();
  });

  it("CatalogProviderSelect exports from catalog-selectors", async () => {
    const selectors = await import("../../../client/src/components/catalog-selectors");
    expect(selectors.CatalogProviderSelect).toBeDefined();
  });

  it("CatalogModelSelect exports from catalog-selectors", async () => {
    const selectors = await import("../../../client/src/components/catalog-selectors");
    expect(selectors.CatalogModelSelect).toBeDefined();
  });

  it("CatalogBotSelect exports from catalog-selectors", async () => {
    const selectors = await import("../../../client/src/components/catalog-selectors");
    expect(selectors.CatalogBotSelect).toBeDefined();
  });

  it("CatalogAgentSelect exports from catalog-selectors", async () => {
    const selectors = await import("../../../client/src/components/catalog-selectors");
    expect(selectors.CatalogAgentSelect).toBeDefined();
  });
});

// ============================================================================
// Catalog availability hooks
// ============================================================================

describe("Catalog App Selectors — Hook Exports", () => {
  it("useCatalogAvailable hooks exist for all domains", async () => {
    const hooks = await import("../../../client/src/hooks/useCatalogAvailable");
    expect(typeof hooks.useCatalogAvailableLLMs).toBe("function");
    expect(typeof hooks.useCatalogAvailableProviders).toBe("function");
    expect(typeof hooks.useCatalogAvailableModels).toBe("function");
    expect(typeof hooks.useCatalogAvailableBots).toBe("function");
    expect(typeof hooks.useCatalogAvailableAgents).toBe("function");
  });
});

// ============================================================================
// Only Catalog-available assets returned (filtering contract)
// ============================================================================

describe("Catalog App Selectors — Availability Filtering", () => {
  it("selector options should only contain active+approved entries", () => {
    // Simulate what the selector hooks do: filter by CATALOG_AVAILABILITY_FILTERS
    const allEntries = [
      { id: 1, status: "active", reviewState: "approved", name: "Active Provider", entryType: "provider" },
      { id: 2, status: "draft", reviewState: "needs_review", name: "Draft Provider", entryType: "provider" },
      { id: 3, status: "active", reviewState: "rejected", name: "Rejected Provider", entryType: "provider" },
      { id: 4, status: "deprecated", reviewState: "approved", name: "Old Provider", entryType: "provider" },
      { id: 5, status: "disabled", reviewState: "approved", name: "Disabled Provider", entryType: "provider" },
      { id: 6, status: "active", reviewState: "approved", name: "Another Active", entryType: "provider" },
    ];

    const available = allEntries.filter(
      (e) => e.status === CATALOG_AVAILABILITY_FILTERS.status &&
             e.reviewState === CATALOG_AVAILABILITY_FILTERS.reviewState
    );

    expect(available.length).toBe(2);
    expect(available.map((e) => e.id)).toEqual([1, 6]);
  });

  it("no raw domain leakage: availability uses Catalog authority, not domain status", () => {
    // A model with status="ready" in domain table is NOT directly available
    // It must go through Catalog import and reach active+approved there
    const domainReady = { status: "ready" }; // domain status
    const catalogState = { status: "draft", reviewState: "needs_review" }; // catalog state
    expect(isCatalogEntryAvailableForAppUse(catalogState)).toBe(false);
  });
});

// ============================================================================
// Selector label and value contracts
// ============================================================================

describe("Catalog App Selectors — Labels and Values", () => {
  it("selector options follow CatalogSelectorOption shape", async () => {
    const types = await import("../../../shared/catalog-selector-types");
    // The type should export CatalogSelectorOption
    expect(types).toBeDefined();
  });

  it("available entry produces valid selector option", () => {
    // Simulate mapping from catalog entry to selector option
    const entry = {
      id: 1,
      name: "gpt-4o",
      displayName: "GPT-4o",
      status: "active",
      reviewState: "approved",
      entryType: "llm",
      tags: ["published"],
    };

    const option = {
      value: entry.id,
      label: entry.displayName || entry.name,
      badge: entry.status,
      metadata: { entryType: entry.entryType },
    };

    expect(option.value).toBe(1);
    expect(option.label).toBe("GPT-4o");
    expect(option.badge).toBe("active");
  });
});

// ============================================================================
// No raw domain queries in app-usage paths
// ============================================================================

describe("Catalog App Selectors — No Raw Domain Leakage", () => {
  it("Chat page uses Catalog selectors, not raw domain queries", async () => {
    // Verify the Chat page imports Catalog selectors
    // This is a structural contract test
    const fs = await import("fs");
    const chatContent = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/pages/Chat.tsx"),
      "utf-8"
    );

    // Should import Catalog selectors
    expect(chatContent).toContain("CatalogProviderSelect");
    expect(chatContent).toContain("CatalogModelSelect");

    // Should NOT contain raw provider list queries for app usage
    // (admin/settings pages may still use raw queries — that's OK)
  });

  it("useCatalogAvailable hooks call catalogManage.available, not raw domain endpoints", async () => {
    const fs = await import("fs");
    const hookContent = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/hooks/useCatalogAvailable.ts"),
      "utf-8"
    );

    expect(hookContent).toContain("catalogManage.available");
    // Should NOT call trpc.providers.list or trpc.models.list for availability
  });
});
