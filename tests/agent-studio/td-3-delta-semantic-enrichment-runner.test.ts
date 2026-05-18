/**
 * T-D.3.δ — Semantic Enrichment trigger runner composition test.
 *
 * The runner is the single composition site that fans
 * `listCandidatesByKind` + store + evidence-collector + proposer +
 * agent into one operator-callable mutation. This test exercises the
 * three terminal envelope shapes:
 *
 *   - `kind_not_yet_supported` — deferred-kind gate (no I/O)
 *   - `no_candidates` — selector returned empty (no agent call)
 *   - `ok` — selector returned non-empty → agent runs → envelope
 *     surfaces selector truncation + agent counts
 *
 * The underlying factories are mocked (`vi.mock`) so the test exercises
 * composition logic only, not DB or LLM I/O. The agent + store +
 * collector + proposer have their own behavioral suites
 * (`td-3-{1..5,β,γ,ε}-*`).
 *
 * Source-scan: the runner is the ONLY graph-enrichment module that
 * imports openrouter (dynamic import via `resolveExecutor`); pinned
 * by `td-3-delta-semantic-enrichment-runner-boundary.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ────────────────────────────────────────────────────────────────────
// Mocks — replace every factory the runner composes
// ────────────────────────────────────────────────────────────────────

const listCandidatesMock = vi.fn();
const createStoreMock = vi.fn();
const createEvidenceCollectorMock = vi.fn();
const createProposerMock = vi.fn();
const createAgentMock = vi.fn();
const agentRunMock = vi.fn();

vi.mock(
  "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-candidate-selector.js",
  () => ({
    listSemanticEnrichmentCandidates: (...args: unknown[]) => listCandidatesMock(...args),
    SEMANTIC_ENRICHMENT_CANDIDATES_DEFAULT_LIMIT: 50,
    SEMANTIC_ENRICHMENT_CANDIDATES_ABSOLUTE_LIMIT: 500,
    DEFAULT_WEAK_DESCRIPTION_MAX_LENGTH: 40,
  }),
);

vi.mock(
  "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-store.js",
  () => ({
    createSemanticEnrichmentStore: () => createStoreMock(),
  }),
);

vi.mock(
  "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-evidence-collector.js",
  () => ({
    createSemanticEnrichmentEvidenceCollector: () => createEvidenceCollectorMock(),
  }),
);

vi.mock(
  "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-proposer.js",
  () => ({
    createSemanticEnrichmentProposer: (opts: unknown) => createProposerMock(opts),
  }),
);

vi.mock(
  "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-agent.ts",
  () => ({
    createSemanticEnrichmentAgent: (parts: unknown) => createAgentMock(parts),
  }),
);

import {
  runSemanticEnrichment,
  isSupportedTriggerProposalKind,
  SUPPORTED_TRIGGER_PROPOSAL_KINDS,
} from "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-runner";

beforeEach(() => {
  listCandidatesMock.mockReset();
  createStoreMock.mockReset();
  createEvidenceCollectorMock.mockReset();
  createProposerMock.mockReset();
  createAgentMock.mockReset();
  agentRunMock.mockReset();

  // Default: store/collector/proposer factories return opaque sentinels;
  // tests that care override per-case.
  createStoreMock.mockReturnValue({ __kind: "store" });
  createEvidenceCollectorMock.mockReturnValue({ __kind: "evidenceCollector" });
  createProposerMock.mockReturnValue({ __kind: "proposer" });
  createAgentMock.mockReturnValue({ run: agentRunMock });
});

// ────────────────────────────────────────────────────────────────────
// Supported-kind gate
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ — supported-kind gate", () => {
  it("SUPPORTED_TRIGGER_PROPOSAL_KINDS lists exactly the 3 wired kinds", () => {
    expect([...SUPPORTED_TRIGGER_PROPOSAL_KINDS].sort()).toEqual(
      ["description_enrichment", "entity_disambiguation", "missing_property_fill"].sort(),
    );
  });

  it("isSupportedTriggerProposalKind returns true for description_enrichment", () => {
    expect(isSupportedTriggerProposalKind("description_enrichment")).toBe(true);
  });

  it("isSupportedTriggerProposalKind returns true for missing_property_fill", () => {
    expect(isSupportedTriggerProposalKind("missing_property_fill")).toBe(true);
  });

  it("isSupportedTriggerProposalKind returns true for entity_disambiguation (T-D.3.δ-followup β)", () => {
    expect(isSupportedTriggerProposalKind("entity_disambiguation")).toBe(true);
  });

  it("isSupportedTriggerProposalKind returns false for the 2 deferred kinds", () => {
    expect(isSupportedTriggerProposalKind("stale_fact_refresh")).toBe(false);
    expect(isSupportedTriggerProposalKind("relationship_label_repair")).toBe(
      false,
    );
  });
});

// ────────────────────────────────────────────────────────────────────
// Envelope shapes
// ────────────────────────────────────────────────────────────────────

describe("T-D.3.δ — kind_not_yet_supported envelope", () => {
  it("returns kind_not_yet_supported for stale_fact_refresh without touching I/O", async () => {
    const result = await runSemanticEnrichment(
      {
        workspaceId: 1,
        proposalKind: "stale_fact_refresh",
        providerConnectionId: 11,
        modelRef: "anthropic/claude-haiku-4-5",
        actorId: 99,
      },
      { modelAccessExecute: vi.fn() },
    );

    expect(result.status).toBe("kind_not_yet_supported");
    if (result.status === "kind_not_yet_supported") {
      expect(result.proposalKind).toBe("stale_fact_refresh");
      expect([...result.supportedKinds].sort()).toEqual(
        ["description_enrichment", "entity_disambiguation", "missing_property_fill"].sort(),
      );
      expect(result.message).toMatch(/contract extension/i);
    }
    expect(listCandidatesMock).not.toHaveBeenCalled();
    expect(createAgentMock).not.toHaveBeenCalled();
  });

  it("returns kind_not_yet_supported for relationship_label_repair (only deferred non-stale kind)", async () => {
    const result = await runSemanticEnrichment(
      {
        workspaceId: 1,
        proposalKind: "relationship_label_repair",
        providerConnectionId: 11,
        modelRef: "anthropic/claude-haiku-4-5",
        actorId: 99,
      },
      { modelAccessExecute: vi.fn() },
    );
    expect(result.status).toBe("kind_not_yet_supported");
    if (result.status === "kind_not_yet_supported") {
      expect(result.proposalKind).toBe("relationship_label_repair");
    }
  });
});

describe("T-D.3.δ — no_candidates envelope", () => {
  it("returns no_candidates when the selector yields zero rows (description_enrichment)", async () => {
    listCandidatesMock.mockResolvedValue({
      proposalKind: "description_enrichment",
      candidates: [],
      truncated: false,
      weakDescriptionMaxLengthUsed: 40,
    });

    const result = await runSemanticEnrichment(
      {
        workspaceId: 42,
        proposalKind: "description_enrichment",
        providerConnectionId: 11,
        modelRef: "anthropic/claude-haiku-4-5",
        actorId: 99,
        typeKey: "service",
      },
      { modelAccessExecute: vi.fn() },
    );

    expect(result.status).toBe("no_candidates");
    if (result.status === "no_candidates") {
      expect(result.proposalKind).toBe("description_enrichment");
      expect(result.candidatesSelected).toBe(0);
      expect(result.weakDescriptionMaxLengthUsed).toBe(40);
      expect(result.message).toMatch(/workspace 42/);
      expect(result.message).toMatch(/typeKey="service"/);
    }

    expect(listCandidatesMock).toHaveBeenCalledTimes(1);
    expect(createAgentMock).not.toHaveBeenCalled();
    expect(agentRunMock).not.toHaveBeenCalled();
  });

  it("returns no_candidates without typeKey clause when typeKey is omitted", async () => {
    listCandidatesMock.mockResolvedValue({
      proposalKind: "missing_property_fill",
      candidates: [],
      truncated: false,
      weakDescriptionMaxLengthUsed: null,
    });

    const result = await runSemanticEnrichment(
      {
        workspaceId: 7,
        proposalKind: "missing_property_fill",
        providerConnectionId: 11,
        modelRef: "anthropic/claude-haiku-4-5",
        actorId: 99,
      },
      { modelAccessExecute: vi.fn() },
    );

    expect(result.status).toBe("no_candidates");
    if (result.status === "no_candidates") {
      expect(result.weakDescriptionMaxLengthUsed).toBeNull();
      expect(result.message).not.toMatch(/typeKey=/);
    }
  });
});

describe("T-D.3.δ — ok envelope", () => {
  it("runs the agent + surfaces selector truncation + counts the agent's full output", async () => {
    listCandidatesMock.mockResolvedValue({
      proposalKind: "description_enrichment",
      candidates: [
        { targetTypeKey: "service", targetId: 1, proposalKind: "description_enrichment" },
        { targetTypeKey: "service", targetId: 2, proposalKind: "description_enrichment" },
        { targetTypeKey: "service", targetId: 3, proposalKind: "description_enrichment" },
      ],
      truncated: true,
      weakDescriptionMaxLengthUsed: 40,
    });
    const startedAt = new Date("2026-05-18T10:00:00Z");
    const completedAt = new Date("2026-05-18T10:01:00Z");
    agentRunMock.mockResolvedValue({
      runId: 555,
      proposalsCreated: 2,
      proposalsRejectedBelowThreshold: 1,
      candidatesSkippedNoCitations: 0,
      candidatesSkippedProposerError: 0,
      status: "completed",
      startedAt,
      completedAt,
    });

    const result = await runSemanticEnrichment(
      {
        workspaceId: 1,
        proposalKind: "description_enrichment",
        providerConnectionId: 11,
        modelRef: "anthropic/claude-haiku-4-5",
        actorId: 99,
        maxProposals: 10,
        minConfidence: 0.75,
        candidateLimit: 100,
        weakDescriptionMaxLength: 50,
        temperature: 0.1,
        typeKey: "service",
      },
      { modelAccessExecute: vi.fn() },
    );

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.runId).toBe(555);
      expect(result.proposalsCreated).toBe(2);
      expect(result.proposalsRejectedBelowThreshold).toBe(1);
      expect(result.candidatesSelected).toBe(3);
      expect(result.candidatesTruncated).toBe(true);
      expect(result.runStatus).toBe("completed");
      expect(result.startedAt).toBe(startedAt);
      expect(result.completedAt).toBe(completedAt);
    }

    expect(listCandidatesMock).toHaveBeenCalledWith({
      workspaceId: 1,
      proposalKind: "description_enrichment",
      limit: 100,
      typeKey: "service",
      weakDescriptionMaxLength: 50,
    });

    // Optional fields are spread only when set — verifies the
    // conditional spread blocks in the runner.
    const proposerArgs = createProposerMock.mock.calls[0]?.[0];
    expect(proposerArgs).toMatchObject({
      providerConnectionId: 11,
      modelRef: "anthropic/claude-haiku-4-5",
      actorId: 99,
      temperature: 0.1,
    });

    const agentArgs = agentRunMock.mock.calls[0]?.[0];
    expect(agentArgs).toMatchObject({
      workspaceId: 1,
      scopeTypeKey: "service",
      maxProposals: 10,
      minConfidence: 0.75,
    });
    expect(agentArgs.candidates).toHaveLength(3);
  });

  it("omits optional fields from listCandidates + agent.run inputs when not provided", async () => {
    listCandidatesMock.mockResolvedValue({
      proposalKind: "missing_property_fill",
      candidates: [
        { targetTypeKey: "service", targetId: 10, proposalKind: "missing_property_fill" },
      ],
      truncated: false,
      weakDescriptionMaxLengthUsed: null,
    });
    agentRunMock.mockResolvedValue({
      runId: 600,
      proposalsCreated: 0,
      proposalsRejectedBelowThreshold: 0,
      candidatesSkippedNoCitations: 1,
      candidatesSkippedProposerError: 0,
      status: "completed",
      startedAt: new Date(),
      completedAt: new Date(),
    });

    await runSemanticEnrichment(
      {
        workspaceId: 1,
        proposalKind: "missing_property_fill",
        providerConnectionId: 11,
        modelRef: "anthropic/claude-haiku-4-5",
        actorId: 99,
      },
      { modelAccessExecute: vi.fn() },
    );

    const listArgs = listCandidatesMock.mock.calls[0]?.[0];
    expect(listArgs).toEqual({
      workspaceId: 1,
      proposalKind: "missing_property_fill",
    });

    const agentArgs = agentRunMock.mock.calls[0]?.[0];
    expect(agentArgs.workspaceId).toBe(1);
    expect("scopeTypeKey" in agentArgs).toBe(false);
    expect("maxProposals" in agentArgs).toBe(false);
    expect("minConfidence" in agentArgs).toBe(false);

    const proposerArgs = createProposerMock.mock.calls[0]?.[0];
    expect("temperature" in proposerArgs).toBe(false);
  });

  it("passes the test-seam executor into the proposer (no dynamic openrouter import)", async () => {
    listCandidatesMock.mockResolvedValue({
      proposalKind: "description_enrichment",
      candidates: [
        { targetTypeKey: "service", targetId: 1, proposalKind: "description_enrichment" },
      ],
      truncated: false,
      weakDescriptionMaxLengthUsed: 40,
    });
    agentRunMock.mockResolvedValue({
      runId: 1,
      proposalsCreated: 1,
      proposalsRejectedBelowThreshold: 0,
      candidatesSkippedNoCitations: 0,
      candidatesSkippedProposerError: 0,
      status: "completed",
      startedAt: new Date(),
      completedAt: new Date(),
    });

    const testExecute = vi.fn();
    await runSemanticEnrichment(
      {
        workspaceId: 1,
        proposalKind: "description_enrichment",
        providerConnectionId: 11,
        modelRef: "anthropic/claude-haiku-4-5",
        actorId: 99,
      },
      { modelAccessExecute: testExecute },
    );

    const proposerArgs = createProposerMock.mock.calls[0]?.[0];
    expect(proposerArgs.modelAccess.execute).toBe(testExecute);
  });
});
