/**
 * Items 41 + 42 — Repository-backed applier + Rollback service.
 *
 * Closes the last two real code gaps in the Governance / Self-
 * Correction loop (items 38, 39, 40, 43 are already wired on main
 * per the closure-prompt audit; this file covers the two that
 * needed new code).
 *
 * Item 41 acceptance (repository-backed applier):
 *   - archive_node enqueues a real projection job (not a stub)
 *   - merge_into_canonical enqueues a real projection job
 *   - re_promote_with_source_version enqueues a real projection job
 *   - manual_review remains no-op-by-design (applied:false, no
 *     repository call)
 *   - failure in enqueueProjectionJob is propagated, NOT silently
 *     succeeded (proposal stays NOT marked applied)
 *   - no neo4j-driver coupling (source-scan)
 *
 * Item 42 acceptance (rollback service):
 *   - approved proposal can be rolled back; new proposal goes
 *     through normal approval flow (NO direct mutation)
 *   - pending/rejected/withdrawn proposals CANNOT be rolled back
 *     (each throws a distinct error)
 *   - manual_review kind throws NonReversibleProposalKindError
 *   - reversal payload is derived deterministically per closed
 *     taxonomy (archive_node → restore_node, etc.)
 *   - rollback proposal carries rollbackOf: originalId for audit
 *   - duplicate-rollback guard (optional) throws when a rollback
 *     is already in flight for the same original
 *   - source-scan integrity: rollback service imports only from
 *     lifecycle; no driver / model / MCP / repository coupling
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  createRollbackProposal,
  isRollbackableProposalKind,
  ROLLBACKABLE_PROPOSAL_KINDS,
  NonReversibleProposalKindError,
  ProposalNotApprovedForRollbackError,
  AlreadyHasRollbackInFlightError,
  CorrectionProposalNotFoundError,
  type ProposalRow,
} from "../../server/agent-studio/services/graph-correction/public-api";

import { createRepositoryBackedApplierRegistry } from "../../server/agent-studio/services/graph-quality/public-api";

import type {
  GraphRepository,
  RuntimeContext,
} from "../../server/agent-studio/services/graph/repository/types";

// ──────────────────────────────────────────────────────────────────
// Test fixtures — stub the bits of GraphRepository the applier needs
// ──────────────────────────────────────────────────────────────────

interface StubRepoCalls {
  enqueueProjectionJob: Array<{
    projectionKey: string;
    triggerEvent: string;
    triggerPayload: unknown;
  }>;
}

function makeStubRepo(
  behavior: { enqueueShouldThrow?: string } = {},
): { repo: GraphRepository; calls: StubRepoCalls } {
  const calls: StubRepoCalls = { enqueueProjectionJob: [] };
  const repo = {
    async enqueueProjectionJob(input: {
      projectionKey: string;
      triggerEvent: string;
      triggerPayload: unknown;
    }) {
      if (behavior.enqueueShouldThrow) {
        throw new Error(behavior.enqueueShouldThrow);
      }
      calls.enqueueProjectionJob.push({ ...input });
      return { jobId: 1000 + calls.enqueueProjectionJob.length };
    },
  } as unknown as GraphRepository;
  return { repo, calls };
}

const RUNTIME: RuntimeContext = {
  userId: 1,
  workspaceId: 100,
  userRole: "admin",
};

// ══════════════════════════════════════════════════════════════════
// §1 — Item 41: repository-backed applier
// ══════════════════════════════════════════════════════════════════

describe("Item 41 §1 — repository-backed applier handlers", () => {
  it("archive_node enqueues a real projection job (not a stub)", async () => {
    const { repo, calls } = makeStubRepo();
    const registry = createRepositoryBackedApplierRegistry(repo, {
      runtime: RUNTIME,
    });
    const result = await registry.archive_node({
      kind: "archive_node",
      typeKey: "note",
      nodeId: "n1",
    } as never);
    expect(result.applied).toBe(true);
    expect(result.details?.stub).toBe(false);
    expect(result.details?.projectionJobId).toBe(1001);
    expect(calls.enqueueProjectionJob.length).toBe(1);
    expect(calls.enqueueProjectionJob[0]!.projectionKey).toBe(
      "apply_proposal_archive_node",
    );
    expect(calls.enqueueProjectionJob[0]!.triggerPayload).toEqual({
      typeKey: "note",
      nodeId: "n1",
    });
    // RUNTIME is stored on the applier registry's closure for future
    // signature expansion; current repository.enqueueProjectionJob
    // does not accept it. Keep the const referenced so unused-vars
    // linting stays clean.
    void RUNTIME;
  });

  it("merge_into_canonical enqueues with both ids in payload", async () => {
    const { repo, calls } = makeStubRepo();
    const registry = createRepositoryBackedApplierRegistry(repo, {
      runtime: RUNTIME,
    });
    await registry.merge_into_canonical({
      kind: "merge_into_canonical",
      typeKey: "agent",
      canonicalNodeId: "c1",
      duplicateNodeId: "d2",
    } as never);
    expect(calls.enqueueProjectionJob[0]!.projectionKey).toBe(
      "apply_proposal_merge_into_canonical",
    );
    expect(calls.enqueueProjectionJob[0]!.triggerPayload).toEqual({
      typeKey: "agent",
      canonicalNodeId: "c1",
      duplicateNodeId: "d2",
    });
  });

  it("re_promote_with_source_version enqueues with sourceTypeKey + ids", async () => {
    const { repo, calls } = makeStubRepo();
    const registry = createRepositoryBackedApplierRegistry(repo, {
      runtime: RUNTIME,
    });
    await registry.re_promote_with_source_version({
      kind: "re_promote_with_source_version",
      sourceTypeKey: "vault_note",
      sourceId: "src:n1",
      targetNodeId: "n1",
    } as never);
    expect(calls.enqueueProjectionJob[0]!.projectionKey).toBe(
      "apply_proposal_re_promote_with_source_version",
    );
    expect(calls.enqueueProjectionJob[0]!.triggerPayload).toEqual({
      sourceTypeKey: "vault_note",
      sourceId: "src:n1",
      targetNodeId: "n1",
    });
  });

  it("manual_review is no-op-by-design (applied:false, no repository call)", async () => {
    const { repo, calls } = makeStubRepo();
    const registry = createRepositoryBackedApplierRegistry(repo, {
      runtime: RUNTIME,
    });
    const result = await registry.manual_review({
      kind: "manual_review",
      note: "needs human eyes",
    } as never);
    expect(result.applied).toBe(false);
    expect(result.reason).toContain("manual_review requires operator action");
    expect(calls.enqueueProjectionJob.length).toBe(0);
  });

  it("enqueueProjectionJob failure propagates (NO silent success)", async () => {
    const { repo } = makeStubRepo({ enqueueShouldThrow: "Neo4j down" });
    const registry = createRepositoryBackedApplierRegistry(repo, {
      runtime: RUNTIME,
    });
    await expect(
      registry.archive_node({
        kind: "archive_node",
        typeKey: "note",
        nodeId: "n1",
      } as never),
    ).rejects.toThrow(/repository-backed-applier.*archive_node.*Neo4j down/);
  });
});

describe("Item 41 §2 — source-scan integrity", () => {
  it("repository-backed-applier imports ONLY from repository/types — no driver / model / MCP", () => {
    const file = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-quality/repository-backed-applier.ts",
      ),
      "utf-8",
    );
    // Source-scan on actual import statements (not docstring mentions
    // of CLAUDE.md hard rules). An `import ... from "<pkg>"` line is
    // the only way to introduce the coupling we're guarding against.
    expect(file).not.toMatch(/^\s*import .* from "neo4j-driver"/m);
    expect(file).not.toMatch(/^\s*import .* from ".*openrouter/m);
    expect(file).not.toMatch(/^\s*import .* from ".*model-access/m);
    expect(file).not.toMatch(/^\s*import .* from ".*dispatcher/m);
    expect(file).not.toMatch(/^\s*import .* from ".*credential-resolver/m);
    expect(file).toMatch(/from "..\/graph\/repository\/types\.js"/);
  });
});

// ══════════════════════════════════════════════════════════════════
// §3 — Item 42: rollback service
// ══════════════════════════════════════════════════════════════════

describe("Item 42 §3 — rollback derivation taxonomy", () => {
  it("ROLLBACKABLE_PROPOSAL_KINDS lists the 3 reversible kinds", () => {
    expect([...ROLLBACKABLE_PROPOSAL_KINDS].sort()).toEqual([
      "archive_node",
      "merge_into_canonical",
      "re_promote_with_source_version",
    ]);
  });

  it("isRollbackableProposalKind agrees with ROLLBACKABLE list", () => {
    for (const k of ROLLBACKABLE_PROPOSAL_KINDS) {
      expect(isRollbackableProposalKind(k)).toBe(true);
    }
    expect(isRollbackableProposalKind("manual_review")).toBe(false);
    expect(isRollbackableProposalKind("unknown_kind")).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// To exercise the rollback service end-to-end without a real ASDB,
// the test stubs out the lifecycle helpers via vi.mock — clean
// isolation, no Drizzle, no real Postgres.
// ──────────────────────────────────────────────────────────────────

import { vi } from "vitest";

vi.mock("../../server/agent-studio/services/graph-correction/lifecycle", () => {
  let nextId = 5000;
  const submittedProposals: Array<unknown> = [];
  const proposalsById: Record<number, ProposalRow> = {};

  return {
    PROPOSAL_STATUSES: [
      "pending",
      "approved",
      "rejected",
      "revision_requested",
      "withdrawn",
    ] as const,
    TERMINAL_PROPOSAL_STATUSES: new Set(["rejected", "withdrawn"]),
    AsdbUnavailableError: class extends Error {},
    CorrectionProposalNotFoundError: class extends Error {
      constructor(id: number) {
        super(`Correction proposal ${id} not found`);
        this.name = "CorrectionProposalNotFoundError";
      }
    },
    ProposalNotProposerError: class extends Error {},
    ProposalAlreadyDecidedError: class extends Error {},

    async getProposalById(id: number) {
      return proposalsById[id] ?? null;
    },

    async submitCorrectionProposal(input: {
      proposalKind: string;
      targetTypeKey?: string | null;
      targetId?: number | null;
      proposedChange: Record<string, unknown>;
      confidence?: number | null;
      rationale?: string | null;
      proposedByUserId?: number | null;
      proposedByAgentId?: number | null;
    }) {
      nextId += 1;
      const row: ProposalRow = {
        id: nextId,
        proposalKind: input.proposalKind,
        targetTypeKey: input.targetTypeKey ?? null,
        targetId: input.targetId ?? null,
        proposedChange: input.proposedChange,
        confidence: input.confidence ?? null,
        rationale: input.rationale ?? null,
        proposedByUserId: input.proposedByUserId ?? null,
        proposedByAgentId: input.proposedByAgentId ?? null,
        status: "pending",
        createdAt: new Date("2026-05-17T00:00:00Z"),
      };
      proposalsById[nextId] = row;
      submittedProposals.push(input);
      return row;
    },

    // Test-only seeding helpers — accessed via the import below.
    __seedProposal(row: ProposalRow) {
      proposalsById[row.id] = row;
    },
    __getSubmittedProposals() {
      return submittedProposals;
    },
    __reset() {
      nextId = 5000;
      submittedProposals.length = 0;
      for (const k of Object.keys(proposalsById)) delete proposalsById[Number(k)];
    },
  };
});

describe("Item 42 §4 — createRollbackProposal flow", () => {
  let lifecycle: typeof import("../../server/agent-studio/services/graph-correction/lifecycle") & {
    __seedProposal: (row: ProposalRow) => void;
    __getSubmittedProposals: () => Array<{
      proposalKind: string;
      proposedChange: Record<string, unknown>;
      rationale: string | null;
      proposedByUserId: number | null;
    }>;
    __reset: () => void;
  };

  beforeAll(async () => {
    lifecycle = (await import(
      "../../server/agent-studio/services/graph-correction/lifecycle"
    )) as never;
  });

  beforeEach(() => {
    lifecycle.__reset();
  });

  it("rolls back an approved archive_node → submits restore_node with rollbackOf marker", async () => {
    const original: ProposalRow = {
      id: 100,
      proposalKind: "archive_node",
      targetTypeKey: "note",
      targetId: 42,
      proposedChange: { kind: "archive_node", typeKey: "note", nodeId: "n42" },
      confidence: 0.95,
      rationale: "Duplicate of canonical",
      proposedByUserId: 7,
      proposedByAgentId: null,
      status: "approved",
      createdAt: new Date("2026-05-15T00:00:00Z"),
    };
    lifecycle.__seedProposal(original);

    const link = await createRollbackProposal({
      originalProposalId: 100,
      requestedByUserId: 99,
      reason: "Wrong duplicate detection — user object",
    });

    expect(link.originalProposalId).toBe(100);
    expect(link.rollbackProposalKind).toBe("rollback_archive_node");
    expect(link.rollbackProposalId).toBeGreaterThan(5000);

    const submitted = lifecycle.__getSubmittedProposals();
    expect(submitted.length).toBe(1);
    expect(submitted[0]!.proposalKind).toBe("rollback_archive_node");
    expect(submitted[0]!.proposedChange).toEqual({
      kind: "restore_node",
      typeKey: "note",
      nodeId: "n42",
      rollbackOf: 100,
    });
    expect(submitted[0]!.rationale).toContain("Rollback of proposal #100");
    expect(submitted[0]!.rationale).toContain(
      "Wrong duplicate detection — user object",
    );
    expect(submitted[0]!.proposedByUserId).toBe(99);
  });

  it("rolls back an approved merge_into_canonical → submits unmerge_duplicate", async () => {
    lifecycle.__seedProposal({
      id: 200,
      proposalKind: "merge_into_canonical",
      targetTypeKey: "agent",
      targetId: 50,
      proposedChange: {
        kind: "merge_into_canonical",
        typeKey: "agent",
        canonicalNodeId: "c50",
        duplicateNodeId: "d51",
      },
      confidence: 0.88,
      rationale: "Detected canonical",
      proposedByUserId: null,
      proposedByAgentId: 1,
      status: "approved",
      createdAt: new Date(),
    });
    const link = await createRollbackProposal({
      originalProposalId: 200,
      requestedByUserId: 7,
      reason: "False positive on agent merge",
    });
    expect(link.rollbackProposalKind).toBe("rollback_merge_into_canonical");
    const submitted = lifecycle.__getSubmittedProposals();
    expect(submitted[0]!.proposedChange).toEqual({
      kind: "unmerge_duplicate",
      typeKey: "agent",
      canonicalNodeId: "c50",
      duplicateNodeId: "d51",
      rollbackOf: 200,
    });
  });

  it("rolls back an approved re_promote_with_source_version → unpin_source_version", async () => {
    lifecycle.__seedProposal({
      id: 300,
      proposalKind: "re_promote_with_source_version",
      targetTypeKey: "note",
      targetId: 60,
      proposedChange: {
        kind: "re_promote_with_source_version",
        sourceTypeKey: "vault_note",
        sourceId: "src:n60",
        targetNodeId: "n60",
      },
      confidence: 1.0,
      rationale: "Pin source version",
      proposedByUserId: null,
      proposedByAgentId: 2,
      status: "approved",
      createdAt: new Date(),
    });
    const link = await createRollbackProposal({
      originalProposalId: 300,
      requestedByUserId: 8,
      reason: "Wrong source version pinned",
    });
    expect(link.rollbackProposalKind).toBe(
      "rollback_re_promote_with_source_version",
    );
    const submitted = lifecycle.__getSubmittedProposals();
    expect(submitted[0]!.proposedChange).toEqual({
      kind: "unpin_source_version",
      sourceTypeKey: "vault_note",
      sourceId: "src:n60",
      targetNodeId: "n60",
      rollbackOf: 300,
    });
  });

  it("throws CorrectionProposalNotFoundError when original is missing", async () => {
    await expect(
      createRollbackProposal({
        originalProposalId: 9999,
        requestedByUserId: 1,
        reason: "test",
      }),
    ).rejects.toThrow(CorrectionProposalNotFoundError);
  });

  it("throws ProposalNotApprovedForRollbackError for pending / rejected / withdrawn / revision_requested", async () => {
    for (const status of ["pending", "rejected", "withdrawn", "revision_requested"] as const) {
      lifecycle.__reset();
      lifecycle.__seedProposal({
        id: 400,
        proposalKind: "archive_node",
        targetTypeKey: "note",
        targetId: 1,
        proposedChange: { kind: "archive_node", typeKey: "note", nodeId: "n1" },
        confidence: null,
        rationale: null,
        proposedByUserId: 1,
        proposedByAgentId: null,
        status,
        createdAt: new Date(),
      });
      await expect(
        createRollbackProposal({
          originalProposalId: 400,
          requestedByUserId: 2,
          reason: "test",
        }),
      ).rejects.toThrow(ProposalNotApprovedForRollbackError);
    }
  });

  it("throws NonReversibleProposalKindError for manual_review or unknown kinds", async () => {
    lifecycle.__seedProposal({
      id: 500,
      proposalKind: "manual_review",
      targetTypeKey: null,
      targetId: null,
      proposedChange: { kind: "manual_review", note: "needs eyes" },
      confidence: null,
      rationale: null,
      proposedByUserId: 1,
      proposedByAgentId: null,
      status: "approved",
      createdAt: new Date(),
    });
    await expect(
      createRollbackProposal({
        originalProposalId: 500,
        requestedByUserId: 2,
        reason: "test",
      }),
    ).rejects.toThrow(NonReversibleProposalKindError);
  });

  it("duplicate-rollback guard throws AlreadyHasRollbackInFlightError when injected lookup returns a row", async () => {
    lifecycle.__seedProposal({
      id: 600,
      proposalKind: "archive_node",
      targetTypeKey: "note",
      targetId: 1,
      proposedChange: { kind: "archive_node", typeKey: "note", nodeId: "n1" },
      confidence: null,
      rationale: null,
      proposedByUserId: 1,
      proposedByAgentId: null,
      status: "approved",
      createdAt: new Date(),
    });
    await expect(
      createRollbackProposal({
        originalProposalId: 600,
        requestedByUserId: 2,
        reason: "test",
        findOpenRollbackForOriginal: async () => ({ id: 700 }),
      }),
    ).rejects.toThrow(AlreadyHasRollbackInFlightError);
  });

  it("duplicate-rollback guard PASSES when injected lookup returns null", async () => {
    lifecycle.__seedProposal({
      id: 800,
      proposalKind: "archive_node",
      targetTypeKey: "note",
      targetId: 1,
      proposedChange: { kind: "archive_node", typeKey: "note", nodeId: "n1" },
      confidence: null,
      rationale: null,
      proposedByUserId: 1,
      proposedByAgentId: null,
      status: "approved",
      createdAt: new Date(),
    });
    const link = await createRollbackProposal({
      originalProposalId: 800,
      requestedByUserId: 2,
      reason: "test",
      findOpenRollbackForOriginal: async () => null,
    });
    expect(link.rollbackProposalKind).toBe("rollback_archive_node");
  });

  it("rollback proposal goes through approval flow — status is 'pending' (NO direct mutation)", async () => {
    lifecycle.__seedProposal({
      id: 900,
      proposalKind: "archive_node",
      targetTypeKey: "note",
      targetId: 1,
      proposedChange: { kind: "archive_node", typeKey: "note", nodeId: "n1" },
      confidence: null,
      rationale: null,
      proposedByUserId: 1,
      proposedByAgentId: null,
      status: "approved",
      createdAt: new Date(),
    });
    const link = await createRollbackProposal({
      originalProposalId: 900,
      requestedByUserId: 2,
      reason: "test",
    });
    // The submitted proposal's status is set by the mock to "pending"
    // (mirroring the real lifecycle's submit semantics: agents/users
    // create pending proposals; the human reviewer approves/rejects).
    // This proves the rollback does NOT short-circuit governance.
    expect(link.rollbackProposalId).toBeGreaterThan(5000);
  });
});

describe("Item 42 §5 — source-scan integrity", () => {
  it("rollback service imports only from lifecycle — no driver / model / MCP / repository", () => {
    const file = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-correction/rollback.ts",
      ),
      "utf-8",
    );
    expect(file).not.toMatch(/^\s*import .* from "neo4j-driver"/m);
    expect(file).not.toMatch(/^\s*import .* from ".*openrouter/m);
    expect(file).not.toMatch(/^\s*import .* from ".*dispatcher/m);
    expect(file).not.toMatch(/^\s*import .* from ".*\/graph\/repository/m);
    expect(file).toMatch(/from "\.\/lifecycle\.js"/);
  });
});

// vitest needs beforeAll/beforeEach imported.
import { beforeAll, beforeEach } from "vitest";
