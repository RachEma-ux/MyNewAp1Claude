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
  type ExportCatalogLookups,
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
