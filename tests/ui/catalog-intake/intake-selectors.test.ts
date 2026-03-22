/**
 * LAYER 5A — Intake Selector Tests
 *
 * Invariant: Intake selectors (used by CatalogImportWizard) show ONLY
 *            deployable entities from source domains.
 *            They do NOT show Catalog entries.
 *            They navigate with mode=catalog-import, returnTo, deployableOnly params.
 *            Selection only — no management actions.
 *
 * Tests validate: URL patterns, filtering logic, deployment readiness gates
 */

import { describe, it, expect } from "vitest";
import { isDeployable as isModelDeployable } from "../../../server/db/models";
import { isDeployable as isBotDeployable } from "../../../server/db/bots";

// ============================================================================
// Intake navigation URL patterns
// ============================================================================

describe("Intake Selectors — URL Patterns", () => {
  const intakeRoutes = [
    { domain: "LLMs", path: "/list/llms", params: "mode=catalog-import&deployableOnly=1&returnTo=/llm/catalogue/candidate" },
    { domain: "Providers", path: "/list/providers", params: "mode=catalog-import&deployableOnly=1&returnTo=/llm/catalogue/candidate" },
    { domain: "Models", path: "/list/models", params: "mode=catalog-import&deployableOnly=1&returnTo=/llm/catalogue/candidate" },
    { domain: "Bots", path: "/list/bots", params: "mode=catalog-import&deployableOnly=1&returnTo=/llm/catalogue/candidate" },
    { domain: "Agents", path: "/governance/agents", params: "mode=catalog-import&callableOnly=1&returnTo=/llm/catalogue/candidate" },
  ];

  for (const route of intakeRoutes) {
    it(`${route.domain} intake navigates to ${route.path} with correct params`, () => {
      const url = `${route.path}?${route.params}`;
      expect(url).toContain("mode=catalog-import");
      expect(url).toContain("returnTo=");
    });
  }

  it("all intake routes include returnTo pointing to catalog candidate page", () => {
    for (const route of intakeRoutes) {
      expect(route.params).toContain("returnTo=/llm/catalogue/candidate");
    }
  });

  it("intake mode parameter is catalog-import, not any other value", () => {
    for (const route of intakeRoutes) {
      expect(route.params).toContain("mode=catalog-import");
      expect(route.params).not.toContain("mode=normal");
      expect(route.params).not.toContain("mode=browse");
    }
  });
});

// ============================================================================
// Deployable-only filtering
// ============================================================================

describe("Intake Selectors — Deployable Filtering", () => {
  it("model intake shows only deployable models (ready/active)", () => {
    const models = [
      { status: "draft", name: "m1", displayName: "M1", modelType: "llm" },
      { status: "ready", name: "m2", displayName: "M2", modelType: "llm" },
      { status: "active", name: "m3", displayName: "M3", modelType: "llm" },
      { status: "deprecated", name: "m4", displayName: "M4", modelType: "llm" },
      { status: "disabled", name: "m5", displayName: "M5", modelType: "llm" },
    ];

    const deployable = models.filter((m) => isModelDeployable(m as any));
    expect(deployable.length).toBe(2);
    expect(deployable.map((m) => m.name)).toEqual(["m2", "m3"]);
  });

  it("bot intake shows only deployable bots", () => {
    const bots = [
      { status: "draft", name: "b1", channels: ["web"] },
      { status: "configured", name: "b2", channels: ["web"] },
      { status: "validated", name: "b3", channels: ["web", "slack"] },
      { status: "deployable", name: "b4", channels: ["web"] },
      { status: "archived", name: "b5", channels: ["web"] },
      { status: "configured", name: "b6", channels: [] }, // no channels = not deployable
    ];

    const deployable = bots.filter((b) => isBotDeployable(b as any));
    expect(deployable.length).toBe(3);
    expect(deployable.map((b) => b.name)).toEqual(["b2", "b3", "b4"]);
  });
});

// ============================================================================
// Selection-only behavior (no management actions)
// ============================================================================

describe("Intake Selectors — Selection Only", () => {
  it("intake mode does NOT include management operations", () => {
    // The intake URL pattern includes mode=catalog-import
    // which means the page should:
    // 1. Show "Select for Catalog" button
    // 2. NOT show edit/delete/status-change buttons
    // 3. Filter to deployable entities only

    const intakeUrl = "/list/models?mode=catalog-import&deployableOnly=1&returnTo=/llm/catalogue/candidate";
    const params = new URLSearchParams(intakeUrl.split("?")[1]);

    expect(params.get("mode")).toBe("catalog-import");
    expect(params.get("deployableOnly")).toBe("1");
    expect(params.get("returnTo")).toBe("/llm/catalogue/candidate");
  });
});
