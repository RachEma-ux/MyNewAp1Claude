/**
 * Plan v3 Phase 30 — export-catalog backend tests.
 *
 * Drives buildExportCandidate / listExportCandidates / getExportCandidate /
 * prepareExportRegisterPayload / markCandidateImported /
 * reconcileCandidateImports through fakes for the cross-DB lookups and
 * for the inner governance/readiness/reconcile primitives.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const repoMocks = {
  getAgentById: vi.fn(),
  getCurrentDraft: vi.fn(),
  listToolBindings: vi.fn(),
  listKnowledgeBindings: vi.fn(),
  listMemoryConfigs: vi.fn(),
  listWorkflowNodes: vi.fn(),
  getLatestSimulationRun: vi.fn(),
  getLatestTestRun: vi.fn(),
};

vi.mock("../repository", () => ({
  getAgentById: (...a: any[]) => repoMocks.getAgentById(...a),
  getCurrentDraft: (...a: any[]) => repoMocks.getCurrentDraft(...a),
  listToolBindings: (...a: any[]) => repoMocks.listToolBindings(...a),
  listKnowledgeBindings: (...a: any[]) => repoMocks.listKnowledgeBindings(...a),
  listMemoryConfigs: (...a: any[]) => repoMocks.listMemoryConfigs(...a),
  listWorkflowNodes: (...a: any[]) => repoMocks.listWorkflowNodes(...a),
  getLatestSimulationRun: (...a: any[]) =>
    repoMocks.getLatestSimulationRun(...a),
  getLatestTestRun: (...a: any[]) => repoMocks.getLatestTestRun(...a),
}));

const reconcileLegacyImportMock = vi.fn();
vi.mock("../../ai-types/legacy-import", () => ({
  reconcileLegacyImport: (...a: any[]) => reconcileLegacyImportMock(...a),
}));

import {
  buildExportCandidate,
  listExportCandidates,
  getExportCandidate,
  prepareExportRegisterPayload,
  markCandidateImported,
  reconcileCandidateImports,
  reconcileExportCatalogSync,
  type ExportCatalogLookups,
  type ReconcileSyncDriftLookups,
} from "./export-catalog";

function makeLookups(opts: {
  agents?: Array<{
    id: number;
    workspaceId: number;
    name: string;
    lifecycleState: string;
    publishedVersionId: number | null;
    capabilities?: string[];
  }>;
  binding?: any;
  releaseId?: number | null;
  catalogRow?: { id: number; legacyImportState: string | null; activeSourceVersionId: number | null } | null;
  toolRiskClasses?: ReadonlyArray<string>;
  sandboxHealth?: { ok: boolean; impl: string } | null;
}): ExportCatalogLookups {
  return {
    listPublishedAgents: vi.fn(async (filter) => {
      const all = opts.agents ?? [];
      if (filter.workspaceId == null) return all;
      return all.filter((a) => a.workspaceId === filter.workspaceId);
    }),
    resolveAgentBinding: vi.fn(
      async () =>
        opts.binding ?? {
          status: "binding_v1",
          providerConnectionId: 1,
          providerCatalogEntryId: 2,
          modelCatalogEntryId: 3,
        },
    ),
    resolveActiveReleaseId: vi.fn(async () => opts.releaseId ?? 555),
    loadCatalogEntryForAgent: vi.fn(async () => opts.catalogRow ?? null),
    listAgentToolRiskClasses: vi.fn(
      async () => (opts.toolRiskClasses ?? []) as any,
    ),
    // Pass `null` explicitly to drive the unbound-sandbox path; default
    // is healthy node:vm.
    getSandboxHealth: vi.fn(async () =>
      opts.sandboxHealth === undefined
        ? { ok: true, impl: "node-vm" }
        : opts.sandboxHealth,
    ),
  };
}

beforeEach(() => {
  for (const fn of Object.values(repoMocks)) fn.mockReset();
  reconcileLegacyImportMock.mockReset();
  // Defaults for inner readiness/governance to produce a "cleared/ready" verdict.
  repoMocks.getAgentById.mockResolvedValue({
    id: 1,
    name: "test-agent",
    internalKey: "test",
    ownerId: 1,
    agentClass: "assistant",
    lifecycleState: "published",
    publishedVersionId: 7,
  });
  repoMocks.getCurrentDraft.mockResolvedValue({
    id: 10,
    ownerId: 1,
    mission: "do things",
    scope: "narrow",
    successCriteria: "all green",
    agentClass: "assistant",
    systemInstructions: "you are a test agent",
    outputContract: "json",
    governancePolicy: {
      auditRequired: true,
      killSwitchEnabled: true,
      budgetCeiling: 100,
    },
  });
  repoMocks.listToolBindings.mockResolvedValue([]);
  repoMocks.listKnowledgeBindings.mockResolvedValue([]);
  repoMocks.listMemoryConfigs.mockResolvedValue([]);
  repoMocks.listWorkflowNodes.mockResolvedValue([]);
  repoMocks.getLatestSimulationRun.mockResolvedValue(null);
  repoMocks.getLatestTestRun.mockResolvedValue(null);
});

const happyAgent = {
  id: 1,
  workspaceId: 100,
  name: "test-agent",
  lifecycleState: "published",
  publishedVersionId: 7,
  capabilities: ["chat"],
};

describe("buildExportCandidate — Phase 30", () => {
  it("returns null when agent is not in the published list", async () => {
    const r = await buildExportCandidate(99, "user:1", makeLookups({ agents: [] }));
    expect(r).toBeNull();
  });

  it("builds a candidate with status=ready when no catalog row + cleared", async () => {
    const r = await buildExportCandidate(
      1,
      "user:1",
      makeLookups({ agents: [happyAgent] }),
    );
    expect(r).not.toBeNull();
    expect(r!.exportStatus).toBe("ready");
    expect(r!.workspaceId).toBe(100);
    expect(r!.sourceModule).toBe("agentStudio");
    expect(r!.sourceRefId).toBe(1);
    expect(r!.activeSourceVersionId).toBe(555);
  });

  it("returns status=exported when a modern catalog row exists", async () => {
    const r = await buildExportCandidate(
      1,
      "user:1",
      makeLookups({
        agents: [happyAgent],
        catalogRow: { id: 999, legacyImportState: null, activeSourceVersionId: 555 },
      }),
    );
    expect(r!.exportStatus).toBe("exported");
  });

  it("returns status=unresolved when catalog row is legacy_imported_unresolved", async () => {
    const r = await buildExportCandidate(
      1,
      "user:1",
      makeLookups({
        agents: [happyAgent],
        catalogRow: {
          id: 999,
          legacyImportState: "legacy_imported_unresolved",
          activeSourceVersionId: null,
        },
      }),
    );
    expect(r!.exportStatus).toBe("unresolved");
  });

  it("returns status=blocked when readiness has a system blocker (missing agent)", async () => {
    repoMocks.getAgentById.mockResolvedValue(null); // readiness goes blocked
    const r = await buildExportCandidate(
      1,
      "user:1",
      makeLookups({ agents: [happyAgent] }),
    );
    expect(r!.exportStatus).toBe("blocked");
  });

  // ── RAC P10 — D-TOOL-4 + D-SBX-2 wiring ──────────────────────────

  it("racReadiness=ready when read_only-only + healthy sandbox", async () => {
    const r = await buildExportCandidate(
      1,
      "user:1",
      makeLookups({
        agents: [happyAgent],
        toolRiskClasses: ["read_only"],
      }),
    );
    expect(r!.racReadiness.status).toBe("ready");
    expect(r!.exportStatus).toBe("ready");
  });

  it("racReadiness=blocked + exportStatus=blocked when code_execution + no sandbox", async () => {
    const r = await buildExportCandidate(
      1,
      "user:1",
      makeLookups({
        agents: [happyAgent],
        toolRiskClasses: ["code_execution"],
        sandboxHealth: null,
      }),
    );
    expect(r!.racReadiness.status).toBe("blocked");
    expect(r!.racReadiness.reasons).toContain("sandbox_required");
    // RAC hard-block flips exportStatus too (deriveExportStatus).
    expect(r!.exportStatus).toBe("blocked");
  });

  it("racReadiness=blocked when code_execution + unhealthy sandbox", async () => {
    const r = await buildExportCandidate(
      1,
      "user:1",
      makeLookups({
        agents: [happyAgent],
        toolRiskClasses: ["code_execution"],
        sandboxHealth: { ok: false, impl: "node-vm" },
      }),
    );
    expect(r!.racReadiness.status).toBe("blocked");
    expect(r!.racReadiness.reasons).toContain("sandbox_unhealthy");
    expect(r!.exportStatus).toBe("blocked");
  });

  it("racReadiness=ready when code_execution + healthy sandbox", async () => {
    const r = await buildExportCandidate(
      1,
      "user:1",
      makeLookups({
        agents: [happyAgent],
        toolRiskClasses: ["code_execution"],
      }),
    );
    expect(r!.racReadiness.status).toBe("ready");
    expect(r!.exportStatus).toBe("ready");
  });

  it("racReadiness=degraded does NOT flip exportStatus", async () => {
    const r = await buildExportCandidate(
      1,
      "user:1",
      makeLookups({
        agents: [happyAgent],
        toolRiskClasses: ["write"],
      }),
    );
    expect(r!.racReadiness.status).toBe("degraded");
    expect(r!.exportStatus).toBe("ready");
  });

  it("racReadiness=blocked when any tool is quarantined", async () => {
    const r = await buildExportCandidate(
      1,
      "user:1",
      makeLookups({
        agents: [happyAgent],
        toolRiskClasses: ["read_only", "quarantined"],
      }),
    );
    expect(r!.racReadiness.status).toBe("blocked");
    expect(r!.racReadiness.reasons).toContain("quarantined_tool");
    expect(r!.exportStatus).toBe("blocked");
  });
});

describe("listExportCandidates — Phase 30", () => {
  it("filters by workspaceId", async () => {
    const a1 = { ...happyAgent, id: 1, workspaceId: 100 };
    const a2 = { ...happyAgent, id: 2, workspaceId: 200 };
    const r = await listExportCandidates(
      { workspaceId: 100 },
      makeLookups({ agents: [a1, a2] }),
    );
    expect(r.map((c) => c.agentId)).toEqual([1]);
  });

  it("filters by status when provided", async () => {
    const r = await listExportCandidates(
      { status: "exported" },
      makeLookups({
        agents: [happyAgent],
        // No catalogRow → status="ready"
      }),
    );
    expect(r).toEqual([]);
  });

  it("returns all candidates when no filter", async () => {
    const r = await listExportCandidates(
      {},
      makeLookups({
        agents: [
          { ...happyAgent, id: 1 },
          { ...happyAgent, id: 2 },
        ],
      }),
    );
    expect(r).toHaveLength(2);
  });
});

describe("getExportCandidate — Phase 30", () => {
  it("returns null for unknown agent", async () => {
    const r = await getExportCandidate(
      999,
      makeLookups({ agents: [happyAgent] }),
    );
    expect(r).toBeNull();
  });

  it("returns the candidate for a known agent", async () => {
    const r = await getExportCandidate(
      1,
      makeLookups({ agents: [happyAgent] }),
    );
    expect(r?.agentId).toBe(1);
  });
});

describe("prepareExportRegisterPayload — Phase 30", () => {
  it("throws when agent is not a candidate", async () => {
    await expect(
      prepareExportRegisterPayload(
        { agentId: 99, registeredBy: 1 },
        makeLookups({ agents: [] }),
      ),
    ).rejects.toThrow(/not a published candidate/);
  });

  it("throws when candidate is blocked", async () => {
    repoMocks.getAgentById.mockResolvedValue(null);
    await expect(
      prepareExportRegisterPayload(
        { agentId: 1, registeredBy: 1 },
        makeLookups({ agents: [happyAgent] }),
      ),
    ).rejects.toThrow(/not eligible/);
  });

  it("returns register payload with entryType+sourceType=agent and sourceId=agentId", async () => {
    const r = await prepareExportRegisterPayload(
      { agentId: 1, registeredBy: 42 },
      makeLookups({ agents: [happyAgent] }),
      { readinessScoreThreshold: 0 }, // Phase 30 fixture's score is intentionally low
    );
    expect(r.registerPayload.entryType).toBe("agent");
    expect(r.registerPayload.sourceType).toBe("agent");
    expect(r.registerPayload.sourceId).toBe(1);
    expect(r.registerPayload.registeredBy).toBe(42);
    expect(r.registerPayload.fields.tags).toContain("agent-studio-export");
    expect(r.eligibility.eligible).toBe(true);
    // No secret-shaped fields leaked into config
    expect(JSON.stringify(r.registerPayload.fields)).not.toContain("apiKey");
  });

  it("Phase 37: initial status=draft and reviewState=needs_review", async () => {
    const r = await prepareExportRegisterPayload(
      { agentId: 1, registeredBy: 42 },
      makeLookups({ agents: [happyAgent] }),
      { readinessScoreThreshold: 0 },
    );
    expect(r.registerPayload.fields.status).toBe("draft");
    expect(r.registerPayload.fields.reviewState).toBe("needs_review");
    expect(r.registerPayload.fields.origin).toBe("agent_studio");
  });

  it("Phase 37: activeSourceVersionId is top-level (matches Phase 23 column)", async () => {
    const r = await prepareExportRegisterPayload(
      { agentId: 1, registeredBy: 42 },
      makeLookups({ agents: [happyAgent] }),
      { readinessScoreThreshold: 0 },
    );
    expect(r.registerPayload.fields.activeSourceVersionId).toBe(555);
  });

  it("Phase 37: stores export DTO + eligibility gates in config (no secrets)", async () => {
    const r = await prepareExportRegisterPayload(
      { agentId: 1, registeredBy: 42 },
      makeLookups({ agents: [happyAgent] }),
      { readinessScoreThreshold: 0 },
    );
    const cfg = r.registerPayload.fields.config as any;
    expect(cfg.exportDto).toBeDefined();
    expect(cfg.exportDto.sourceModule).toBe("agentStudio");
    expect(cfg.exportDto.sourceRefId).toBe(1);
    expect(cfg.exportDto.governance.status).toBe("cleared");
    expect(Array.isArray(cfg.eligibilityGates)).toBe(true);
    expect(cfg.eligibilityGates.length).toBe(10);
    // No forbidden keys leaked
    const flat = JSON.stringify(cfg).toLowerCase();
    expect(flat).not.toContain("apikey");
    expect(flat).not.toContain("providerconfig");
    expect(flat).not.toContain("systeminstructions");
  });

  it("Phase 31: blocks re-export of already-imported candidates", async () => {
    await expect(
      prepareExportRegisterPayload(
        { agentId: 1, registeredBy: 42 },
        makeLookups({
          agents: [happyAgent],
          catalogRow: {
            id: 999,
            legacyImportState: null,
            activeSourceVersionId: 555,
          },
        }),
        { readinessScoreThreshold: 0 },
      ),
    ).rejects.toThrow(/not_already_imported/);
  });
});

describe("markCandidateImported — Phase 30", () => {
  it("returns ok with the agent and catalog entry ids", async () => {
    const r = await markCandidateImported({ agentId: 1, catalogEntryId: 100 });
    expect(r).toEqual({ ok: true, agentId: 1, catalogEntryId: 100 });
  });
});

describe("reconcileCandidateImports — Phase 30", () => {
  it("delegates to reconcileLegacyImport with the right payload", async () => {
    reconcileLegacyImportMock.mockResolvedValue({
      ok: true,
      catalogEntryId: 100,
      previousState: "legacy_imported_unresolved",
      newState: "manually_reconciled",
      reason: "reconciled",
    });
    const r = await reconcileCandidateImports({} as any, {
      agentId: 1,
      catalogEntryId: 100,
      sourceVersionId: 555,
      reconciledBy: 42,
    });
    expect(r.ok).toBe(true);
    expect(reconcileLegacyImportMock).toHaveBeenCalledWith({}, {
      catalogEntryId: 100,
      activeSourceVersionId: 555,
      reconciledBy: 42,
    });
  });

  it("propagates failures from reconcileLegacyImport", async () => {
    reconcileLegacyImportMock.mockResolvedValue({
      ok: false,
      catalogEntryId: 100,
      previousState: "legacy_imported",
      newState: null,
      reason: "row_not_in_unresolved_state",
    });
    const r = await reconcileCandidateImports({} as any, {
      agentId: 1,
      catalogEntryId: 100,
      sourceVersionId: 555,
      reconciledBy: 42,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("row_not_in_unresolved_state");
  });
});

// ────────────────────────────────────────────────────────────────────
// Plan v3 Phase 41 — bulk drift scan / reconcileExportCatalogSync
// ────────────────────────────────────────────────────────────────────

interface SyncDriftFixtureCatalog {
  id: number;
  legacyImportState: string | null;
  activeSourceVersionId: number | null;
  status: string | null;
}

function makeReconcileLookups(opts: {
  agents: Array<{
    id: number;
    workspaceId: number;
    name: string;
    lifecycleState: string;
    publishedVersionId: number | null;
    capabilities?: string[];
  }>;
  catalogByAgent?: Map<number, SyncDriftFixtureCatalog | null>;
  syncByCatalog?: Map<number, string | null>;
  recordImpl?: (input: any) => Promise<void>;
}): {
  lookups: ReconcileSyncDriftLookups;
  recordCalls: any[];
} {
  const recordCalls: any[] = [];
  const lookups: ReconcileSyncDriftLookups = {
    listPublishedAgents: vi.fn(async (filter) => {
      const all = opts.agents;
      if (filter.workspaceId == null) return all;
      return all.filter((a) => a.workspaceId === filter.workspaceId);
    }),
    loadCatalogEntryForAgent: vi.fn(async (agentId) => {
      return opts.catalogByAgent?.get(agentId) ?? null;
    }),
    getLatestSyncLogEventType: vi.fn(async (catalogEntryId) => {
      return opts.syncByCatalog?.get(catalogEntryId) ?? null;
    }),
    recordSyncLogRepair: vi.fn(async (input) => {
      recordCalls.push(input);
      if (opts.recordImpl) await opts.recordImpl(input);
    }),
  };
  return { lookups, recordCalls };
}

describe("reconcileExportCatalogSync — Phase 41", () => {
  it("returns scanned=0 when no published agents exist", async () => {
    const { lookups } = makeReconcileLookups({ agents: [] });
    const r = await reconcileExportCatalogSync(
      { reconciledBy: 1 },
      lookups,
    );
    expect(r.scanned).toBe(0);
    expect(r.inSync).toBe(0);
    expect(r.drift).toBe(0);
    expect(r.repaired).toBe(0);
  });

  it("classifies in_sync when catalog row + matching latest sync event present", async () => {
    const catalogByAgent = new Map<number, SyncDriftFixtureCatalog>();
    catalogByAgent.set(1, {
      id: 100,
      legacyImportState: null,
      activeSourceVersionId: 17,
      status: "draft",
    });
    const syncByCatalog = new Map<number, string>();
    syncByCatalog.set(100, "aiTypes.catalog.registered");

    const { lookups, recordCalls } = makeReconcileLookups({
      agents: [happyAgent],
      catalogByAgent,
      syncByCatalog,
    });
    const r = await reconcileExportCatalogSync(
      { reconciledBy: 1 },
      lookups,
    );
    expect(r.scanned).toBe(1);
    expect(r.inSync).toBe(1);
    expect(r.drift).toBe(0);
    expect(r.repaired).toBe(0);
    expect(recordCalls).toHaveLength(0);
    expect(r.items[0].driftCase).toBe("in_sync");
  });

  it("classifies missing_registered and writes a synthetic registered row", async () => {
    const catalogByAgent = new Map<number, SyncDriftFixtureCatalog>();
    catalogByAgent.set(1, {
      id: 100,
      legacyImportState: null,
      activeSourceVersionId: 17,
      status: "draft",
    });
    // syncByCatalog empty → no log row present.

    const { lookups, recordCalls } = makeReconcileLookups({
      agents: [happyAgent],
      catalogByAgent,
    });
    const r = await reconcileExportCatalogSync(
      { reconciledBy: 42 },
      lookups,
    );
    expect(r.drift).toBe(1);
    expect(r.repaired).toBe(1);
    expect(r.items[0].driftCase).toBe("missing_registered");
    expect(r.items[0].repaired).toBe(true);

    expect(recordCalls).toHaveLength(1);
    const w = recordCalls[0];
    expect(w.eventType).toBe("aiTypes.catalog.registered");
    expect(w.catalogEntryId).toBe(100);
    expect(w.sourceModule).toBe("agentStudio");
    expect(w.sourceRefId).toBe(1);
    expect(w.action).toBe("reconciled");
    expect(w.eventId).toBe("as-recon-missing_registered-100"); // deterministic
    expect(w.payload.reconciliation).toBe(true);
    expect(w.payload.reconciledBy).toBe(42);
  });

  it("classifies missing_published when catalog row.status='published' but log not yet at published", async () => {
    const catalogByAgent = new Map<number, SyncDriftFixtureCatalog>();
    catalogByAgent.set(1, {
      id: 100,
      legacyImportState: null,
      activeSourceVersionId: 17,
      status: "published",
    });
    const syncByCatalog = new Map<number, string>();
    syncByCatalog.set(100, "aiTypes.catalog.registered"); // stale

    const { lookups, recordCalls } = makeReconcileLookups({
      agents: [happyAgent],
      catalogByAgent,
      syncByCatalog,
    });
    const r = await reconcileExportCatalogSync(
      { reconciledBy: 1 },
      lookups,
    );
    expect(r.items[0].driftCase).toBe("missing_published");
    expect(recordCalls[0].eventType).toBe("aiTypes.catalog.published");
    expect(recordCalls[0].action).toBeNull();
  });

  it("classifies missing_deprecated when catalog row.status='deprecated' but log stale", async () => {
    const catalogByAgent = new Map<number, SyncDriftFixtureCatalog>();
    catalogByAgent.set(1, {
      id: 100,
      legacyImportState: null,
      activeSourceVersionId: 17,
      status: "deprecated",
    });
    const syncByCatalog = new Map<number, string>();
    syncByCatalog.set(100, "aiTypes.catalog.published");

    const { lookups, recordCalls } = makeReconcileLookups({
      agents: [happyAgent],
      catalogByAgent,
      syncByCatalog,
    });
    const r = await reconcileExportCatalogSync(
      { reconciledBy: 1 },
      lookups,
    );
    expect(r.items[0].driftCase).toBe("missing_deprecated");
    expect(recordCalls[0].eventType).toBe("aiTypes.catalog.deprecated");
  });

  it("does NOT write any rows when dryRun=true (preview mode)", async () => {
    const catalogByAgent = new Map<number, SyncDriftFixtureCatalog>();
    catalogByAgent.set(1, {
      id: 100,
      legacyImportState: null,
      activeSourceVersionId: 17,
      status: "draft",
    });

    const { lookups, recordCalls } = makeReconcileLookups({
      agents: [happyAgent],
      catalogByAgent,
    });
    const r = await reconcileExportCatalogSync(
      { reconciledBy: 1, dryRun: true },
      lookups,
    );
    expect(r.dryRun).toBe(true);
    expect(r.drift).toBe(1);
    expect(r.repaired).toBe(0);
    expect(recordCalls).toHaveLength(0);
    expect(r.items[0].repaired).toBe(false);
  });

  it("classifies no_catalog_entry when catalog row is missing entirely", async () => {
    const { lookups, recordCalls } = makeReconcileLookups({
      agents: [happyAgent],
      // catalogByAgent empty → loadCatalogEntryForAgent returns null
    });
    const r = await reconcileExportCatalogSync(
      { reconciledBy: 1 },
      lookups,
    );
    expect(r.items[0].driftCase).toBe("no_catalog_entry");
    expect(r.items[0].catalogEntryId).toBeNull();
    expect(r.repaired).toBe(0);
    expect(recordCalls).toHaveLength(0);
    // no_catalog_entry isn't in_sync but also isn't a fixable drift —
    // it's "the export flow hasn't been run for this agent yet."
    expect(r.inSync).toBe(0);
  });

  it("scans across multiple agents with mixed drift states", async () => {
    const agentA = { ...happyAgent, id: 1 };
    const agentB = { ...happyAgent, id: 2 };
    const agentC = { ...happyAgent, id: 3 };

    const catalogByAgent = new Map<number, SyncDriftFixtureCatalog>();
    catalogByAgent.set(1, {
      id: 100,
      legacyImportState: null,
      activeSourceVersionId: 17,
      status: "draft",
    });
    catalogByAgent.set(2, {
      id: 200,
      legacyImportState: null,
      activeSourceVersionId: 18,
      status: "published",
    });
    // agent 3 has no catalog row.

    const syncByCatalog = new Map<number, string>();
    syncByCatalog.set(100, "aiTypes.catalog.registered"); // in_sync
    // 200 has no log → missing_published

    const { lookups, recordCalls } = makeReconcileLookups({
      agents: [agentA, agentB, agentC],
      catalogByAgent,
      syncByCatalog,
    });
    const r = await reconcileExportCatalogSync(
      { reconciledBy: 1 },
      lookups,
    );
    expect(r.scanned).toBe(3);
    expect(r.inSync).toBe(1);
    expect(r.drift).toBe(1); // only agent B is fixable drift
    expect(r.repaired).toBe(1);
    expect(recordCalls).toHaveLength(1);
    expect(r.items.find((i) => i.agentId === 1)?.driftCase).toBe("in_sync");
    expect(r.items.find((i) => i.agentId === 2)?.driftCase).toBe(
      "missing_published",
    );
    expect(r.items.find((i) => i.agentId === 3)?.driftCase).toBe(
      "no_catalog_entry",
    );
  });

  it("respects workspaceId filter on listPublishedAgents", async () => {
    const a = { ...happyAgent, id: 1, workspaceId: 100 };
    const b = { ...happyAgent, id: 2, workspaceId: 200 };
    const { lookups } = makeReconcileLookups({ agents: [a, b] });
    const r = await reconcileExportCatalogSync(
      { reconciledBy: 1, workspaceId: 100 },
      lookups,
    );
    expect(r.scanned).toBe(1);
    expect(r.items[0].agentId).toBe(1);
  });

  it("repair failures are caught and don't stop the scan (best-effort)", async () => {
    const catalogByAgent = new Map<number, SyncDriftFixtureCatalog>();
    catalogByAgent.set(1, {
      id: 100,
      legacyImportState: null,
      activeSourceVersionId: 17,
      status: "draft",
    });
    catalogByAgent.set(2, {
      id: 200,
      legacyImportState: null,
      activeSourceVersionId: 18,
      status: "draft",
    });

    let calls = 0;
    const { lookups, recordCalls } = makeReconcileLookups({
      agents: [
        { ...happyAgent, id: 1 },
        { ...happyAgent, id: 2 },
      ],
      catalogByAgent,
      recordImpl: async () => {
        calls += 1;
        if (calls === 1) throw new Error("ASDB write failed");
      },
    });

    const r = await reconcileExportCatalogSync(
      { reconciledBy: 1 },
      lookups,
    );
    // Both saw drift, both attempted repair; first failed, second succeeded.
    expect(r.scanned).toBe(2);
    expect(r.drift).toBe(2);
    expect(r.repaired).toBe(1);
    expect(recordCalls).toHaveLength(2); // recorder was called twice
    // First item didn't repair, second did.
    const repairedItems = r.items.filter((i) => i.repaired);
    expect(repairedItems).toHaveLength(1);
  });

  it("eventId is deterministic per (catalogEntryId, driftCase) so reruns are no-ops", async () => {
    const catalogByAgent = new Map<number, SyncDriftFixtureCatalog>();
    catalogByAgent.set(1, {
      id: 100,
      legacyImportState: null,
      activeSourceVersionId: 17,
      status: "draft",
    });

    const { lookups, recordCalls } = makeReconcileLookups({
      agents: [happyAgent],
      catalogByAgent,
    });

    await reconcileExportCatalogSync({ reconciledBy: 1 }, lookups);
    await reconcileExportCatalogSync({ reconciledBy: 1 }, lookups);

    // Recorder called twice, same eventId both times — the unique
    // index on event_id makes the DB-side a no-op even though the
    // service-level recorder was invoked.
    expect(recordCalls).toHaveLength(2);
    expect(recordCalls[0].eventId).toBe(recordCalls[1].eventId);
  });
});
