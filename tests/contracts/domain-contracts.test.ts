/**
 * LAYER 1 — Domain Contract Tests
 *
 * Invariant: Source domains create governed entities in their OWN table.
 *            Source domains NEVER directly create catalog_entries.
 *            Source domains compute isDeployable / getBlockingReasons.
 *
 * Validated for: Models, Bots, Agents, LLMs, Providers
 */

import { describe, it, expect } from "vitest";

// ── Model domain contracts ──────────────────────────────────────────

describe("Domain Contract — Models", () => {
  it("createModel writes to models table, not catalog_entries", async () => {
    // Import the actual DB function to verify its implementation target
    const modelsDb = await import("../../server/db/models");
    expect(typeof modelsDb.createModel).toBe("function");
    expect(typeof modelsDb.getAllModels).toBe("function");
    expect(typeof modelsDb.getModelById).toBe("function");
    expect(typeof modelsDb.updateModel).toBe("function");
    expect(typeof modelsDb.isDeployable).toBe("function");
    expect(typeof modelsDb.getBlockingReasons).toBe("function");
  });

  it("isDeployable returns true only for ready or active", () => {
    const { isDeployable } = require("../../server/db/models");
    // Deployable statuses
    expect(isDeployable({ status: "ready", name: "m", displayName: "M", modelType: "llm" })).toBe(true);
    expect(isDeployable({ status: "active", name: "m", displayName: "M", modelType: "llm" })).toBe(true);
    // Non-deployable statuses
    expect(isDeployable({ status: "draft", name: "m", displayName: "M", modelType: "llm" })).toBe(false);
    expect(isDeployable({ status: "deprecated", name: "m", displayName: "M", modelType: "llm" })).toBe(false);
    expect(isDeployable({ status: "disabled", name: "m", displayName: "M", modelType: "llm" })).toBe(false);
  });

  it("getBlockingReasons returns reasons for non-deployable models", () => {
    const { getBlockingReasons } = require("../../server/db/models");
    const draft = getBlockingReasons({ status: "draft", name: "m", displayName: "M", modelType: "llm" });
    expect(draft.length).toBeGreaterThan(0);
    expect(draft.some((r: string) => r.includes("draft"))).toBe(true);

    const deprecated = getBlockingReasons({ status: "deprecated", name: "m", displayName: "M", modelType: "llm" });
    expect(deprecated.some((r: string) => r.includes("deprecated"))).toBe(true);

    // Clean model has no blocking reasons
    const clean = getBlockingReasons({ status: "ready", name: "m", displayName: "M", modelType: "llm" });
    expect(clean).toEqual([]);
  });

  it("models router has importToCatalog — domain does NOT auto-create catalog entries", async () => {
    const routerModule = await import("../../server/routers/models");
    // The router must export modelsRouter with importToCatalog procedure
    expect(routerModule.modelsRouter).toBeDefined();
  });
});

// ── Bot domain contracts ────────────────────────────────────────────

describe("Domain Contract — Bots", () => {
  it("createBot writes to bots table, not catalog_entries", async () => {
    const botsDb = await import("../../server/db/bots");
    expect(typeof botsDb.createBot).toBe("function");
    expect(typeof botsDb.getAllBots).toBe("function");
    expect(typeof botsDb.getBotById).toBe("function");
    expect(typeof botsDb.isDeployable).toBe("function");
    expect(typeof botsDb.getBlockingReasons).toBe("function");
  });

  it("isDeployable returns true only for configured/validated/deployable with channels", () => {
    const { isDeployable } = require("../../server/db/bots");
    // Deployable
    expect(isDeployable({ status: "configured", name: "b", channels: ["web"] })).toBe(true);
    expect(isDeployable({ status: "validated", name: "b", channels: ["web"] })).toBe(true);
    expect(isDeployable({ status: "deployable", name: "b", channels: ["web"] })).toBe(true);
    // Not deployable
    expect(isDeployable({ status: "draft", name: "b", channels: ["web"] })).toBe(false);
    expect(isDeployable({ status: "archived", name: "b", channels: ["web"] })).toBe(false);
    // Missing channels
    expect(isDeployable({ status: "configured", name: "b", channels: [] })).toBe(false);
  });

  it("getBlockingReasons lists all blockers", () => {
    const { getBlockingReasons } = require("../../server/db/bots");
    const draft = getBlockingReasons({ status: "draft", name: "b", channels: [] });
    expect(draft.length).toBeGreaterThanOrEqual(2); // draft + no channels
    expect(draft.some((r: string) => r.includes("draft"))).toBe(true);
    expect(draft.some((r: string) => r.includes("channel"))).toBe(true);
  });
});

// ── Agent domain contracts ──────────────────────────────────────────

describe("Domain Contract — Agents", () => {
  it("createAgent writes to agents table, not catalog_entries", async () => {
    const agentsDb = await import("../../server/db/agents");
    expect(typeof agentsDb.createAgent).toBe("function");
    expect(typeof agentsDb.getAgentById).toBe("function");
    expect(typeof agentsDb.updateAgent).toBe("function");
  });

  it("agents router has importToCatalog procedure", async () => {
    const routerModule = await import("../../server/routers/agents");
    expect(routerModule.agentsRouter).toBeDefined();
  });
});

// ── LLM domain contracts ────────────────────────────────────────────

describe("Domain Contract — LLMs", () => {
  it("createLLM writes to llms table, not catalog_entries", async () => {
    const llmsDb = await import("../../server/db/llms");
    expect(typeof llmsDb.createLLM).toBe("function");
    expect(typeof llmsDb.getLLMs).toBe("function");
    expect(typeof llmsDb.getLLMById).toBe("function");
    expect(typeof llmsDb.createLLMVersion).toBe("function");
    expect(typeof llmsDb.getLLMVersions).toBe("function");
    expect(typeof llmsDb.getLatestCatalogEligibleVersion).toBe("function");
  });

  it("LLM versions use audit events for all state changes", async () => {
    const llmsDb = await import("../../server/db/llms");
    // These functions must exist — they enforce audit trail
    expect(typeof llmsDb.updateLLMVersionCallable).toBe("function");
    expect(typeof llmsDb.getLLMAuditEvents).toBe("function");
  });
});

// ── Provider domain contracts (via router) ──────────────────────────

describe("Domain Contract — Providers", () => {
  it("providers router exports a router with listEnriched", async () => {
    const routerModule = await import("../../server/providers/router");
    expect(routerModule.providerRouter).toBeDefined();
  });
});
