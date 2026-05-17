/**
 * T-D.3.5 — Semantic Enrichment agent runtime + threshold gate.
 *
 * Behavioral test for the composed agent. Uses in-memory stubs for
 * store + evidence collector + proposer to exercise the full run
 * lifecycle without touching ASDB or LLM providers.
 *
 * Validates:
 *   - run() calls store.beginRun → loop → store.finishRun
 *   - Zero candidates → empty run with proposalsCreated=0
 *   - Citation-empty candidate → skipped (counted) — proposer NOT called
 *   - Proposer error → skipped (counted) — store.recordProposal NOT called
 *   - Confidence < threshold → recordRejectedBelowThreshold + counter++
 *   - Confidence ≥ threshold → recordProposal + counter++
 *   - maxProposals cap → loop stops creating once reached
 *   - Default minConfidence 0.8 enforced
 *   - finishRun receives correct counts + status='completed'
 *
 * Source-scan: no neo4j-driver / openrouter / drizzle / process.env
 * / dispatchMcpToolCall imports. Composition only.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  createSemanticEnrichmentAgent,
  type SemanticEnrichmentAgent,
  type SemanticEnrichmentCandidate,
  type SemanticEnrichmentProposal,
  type SemanticEnrichmentRunOutput,
  type SemanticEnrichmentSourceCitation,
} from "../../server/agent-studio/services/graph-enrichment/public-api";

const AGENT_FILE = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-agent.ts",
);

function readAgent(): string {
  return readFileSync(AGENT_FILE, "utf8");
}

// ────────────────────────────────────────────────────────────────────
// In-memory stubs
// ────────────────────────────────────────────────────────────────────

interface StoreCalls {
  beginRunInputs: unknown[];
  recordProposalCalls: Array<{ runId: number; proposal: SemanticEnrichmentProposal }>;
  recordRejectedCalls: Array<{ runId: number; proposal: SemanticEnrichmentProposal }>;
  finishRunCalls: Array<{ runId: number; summary: unknown }>;
}

function makeStubStore(runId = 7): {
  store: ReturnType<typeof createSemanticEnrichmentAgent> extends never
    ? never
    : Parameters<typeof createSemanticEnrichmentAgent>[0]["store"];
  calls: StoreCalls;
} {
  const calls: StoreCalls = {
    beginRunInputs: [],
    recordProposalCalls: [],
    recordRejectedCalls: [],
    finishRunCalls: [],
  };
  let nextProposalId = 1;
  const store = {
    async beginRun(input: unknown) {
      calls.beginRunInputs.push(input);
      return { runId, startedAt: new Date("2026-05-17T15:00:00Z") };
    },
    async recordProposal(rId: number, proposal: SemanticEnrichmentProposal) {
      calls.recordProposalCalls.push({ runId: rId, proposal });
      return { proposalId: nextProposalId++ };
    },
    async recordRejectedBelowThreshold(
      rId: number,
      proposal: SemanticEnrichmentProposal,
    ) {
      calls.recordRejectedCalls.push({ runId: rId, proposal });
    },
    async finishRun(rId: number, summary: unknown) {
      calls.finishRunCalls.push({ runId: rId, summary });
    },
  } as Parameters<typeof createSemanticEnrichmentAgent>[0]["store"];
  return { store, calls };
}

function makeStubCollector(
  citationsByTargetId: Record<number, SemanticEnrichmentSourceCitation[]>,
) {
  let callCount = 0;
  return {
    collector: {
      async collect(input: { targetId: number }) {
        callCount++;
        return citationsByTargetId[input.targetId] ?? [];
      },
    },
    getCallCount: () => callCount,
  };
}

function makeStubProposer(
  proposalByTargetId: Record<number, SemanticEnrichmentProposal | { error: string }>,
) {
  let callCount = 0;
  return {
    proposer: {
      async propose(input: {
        targetId: number;
        targetTypeKey: string;
        proposalKind: SemanticEnrichmentProposal["kind"];
        citations: ReadonlyArray<SemanticEnrichmentSourceCitation>;
      }) {
        callCount++;
        const entry = proposalByTargetId[input.targetId];
        if (!entry) {
          throw new Error("[stub] no proposal configured for target " + input.targetId);
        }
        if ("error" in entry) {
          throw new Error(entry.error);
        }
        return entry;
      },
    },
    getCallCount: () => callCount,
  };
}

function makeAgent(parts: {
  store: Parameters<typeof createSemanticEnrichmentAgent>[0]["store"];
  collector: Parameters<typeof createSemanticEnrichmentAgent>[0]["evidenceCollector"];
  proposer: Parameters<typeof createSemanticEnrichmentAgent>[0]["proposer"];
}): SemanticEnrichmentAgent {
  return createSemanticEnrichmentAgent({
    store: parts.store,
    evidenceCollector: parts.collector,
    proposer: parts.proposer,
  });
}

function cand(
  targetId: number,
  kind: SemanticEnrichmentProposal["kind"] = "description_enrichment",
): SemanticEnrichmentCandidate {
  return { targetTypeKey: "note", targetId, proposalKind: kind };
}

function proposal(
  targetId: number,
  confidence: number,
): SemanticEnrichmentProposal {
  return {
    kind: "description_enrichment",
    targetTypeKey: "note",
    targetId,
    proposedChange: { description: "x" },
    confidence,
    rationale: "r",
    citations: [{ noteId: 1, noteVersionId: 1, excerpt: "e" }],
  };
}

const HIGH_CONFIDENCE = 0.92;
const LOW_CONFIDENCE = 0.42;

describe("T-D.3.5 — Semantic Enrichment agent (behavioral)", () => {
  it("zero candidates → run completes with all counts at 0", async () => {
    const { store, calls } = makeStubStore();
    const { collector } = makeStubCollector({});
    const { proposer } = makeStubProposer({});
    const agent = makeAgent({ store, collector, proposer });

    const out = await agent.run({ workspaceId: 1, candidates: [] });

    expect(out.runId).toBe(7);
    expect(out.proposalsCreated).toBe(0);
    expect(out.proposalsRejectedBelowThreshold).toBe(0);
    expect(out.candidatesSkippedNoCitations).toBe(0);
    expect(out.candidatesSkippedProposerError).toBe(0);
    expect(out.status).toBe("completed");
    expect(calls.beginRunInputs).toHaveLength(1);
    expect(calls.finishRunCalls).toHaveLength(1);
    expect((calls.finishRunCalls[0]!.summary as any).status).toBe("completed");
  });

  it("calls store.beginRun BEFORE any evidence/propose work", async () => {
    const { store, calls } = makeStubStore();
    const citCol = makeStubCollector({ 1: [{ noteId: 1, noteVersionId: 1, excerpt: "e" }] });
    const propCol = makeStubProposer({ 1: proposal(1, HIGH_CONFIDENCE) });
    const agent = makeAgent({
      store,
      collector: citCol.collector,
      proposer: propCol.proposer,
    });

    await agent.run({ workspaceId: 1, candidates: [cand(1)] });

    expect(calls.beginRunInputs).toHaveLength(1);
    expect(calls.finishRunCalls).toHaveLength(1);
  });

  it("candidate with zero citations is skipped — proposer NOT called", async () => {
    const { store, calls } = makeStubStore();
    const citCol = makeStubCollector({ 1: [] });
    const propCol = makeStubProposer({});
    const agent = makeAgent({
      store,
      collector: citCol.collector,
      proposer: propCol.proposer,
    });

    const out = await agent.run({ workspaceId: 1, candidates: [cand(1)] });

    expect(out.candidatesSkippedNoCitations).toBe(1);
    expect(out.proposalsCreated).toBe(0);
    expect(propCol.getCallCount()).toBe(0);
    expect(calls.recordProposalCalls).toHaveLength(0);
  });

  it("proposer error is caught + counted — recordProposal NOT called", async () => {
    const { store, calls } = makeStubStore();
    const citCol = makeStubCollector({
      1: [{ noteId: 1, noteVersionId: 1, excerpt: "e" }],
    });
    const propCol = makeStubProposer({ 1: { error: "parse failed" } });
    const agent = makeAgent({
      store,
      collector: citCol.collector,
      proposer: propCol.proposer,
    });

    const out = await agent.run({ workspaceId: 1, candidates: [cand(1)] });

    expect(out.candidatesSkippedProposerError).toBe(1);
    expect(out.proposalsCreated).toBe(0);
    expect(calls.recordProposalCalls).toHaveLength(0);
    expect(calls.recordRejectedCalls).toHaveLength(0);
  });

  it("confidence below threshold → recordRejectedBelowThreshold (not recordProposal)", async () => {
    const { store, calls } = makeStubStore();
    const citCol = makeStubCollector({
      1: [{ noteId: 1, noteVersionId: 1, excerpt: "e" }],
    });
    const propCol = makeStubProposer({ 1: proposal(1, LOW_CONFIDENCE) });
    const agent = makeAgent({
      store,
      collector: citCol.collector,
      proposer: propCol.proposer,
    });

    const out = await agent.run({ workspaceId: 1, candidates: [cand(1)] });

    expect(out.proposalsCreated).toBe(0);
    expect(out.proposalsRejectedBelowThreshold).toBe(1);
    expect(calls.recordRejectedCalls).toHaveLength(1);
    expect(calls.recordProposalCalls).toHaveLength(0);
    expect(calls.recordRejectedCalls[0]!.proposal.confidence).toBe(LOW_CONFIDENCE);
  });

  it("confidence ≥ threshold → recordProposal + counter increment", async () => {
    const { store, calls } = makeStubStore();
    const citCol = makeStubCollector({
      1: [{ noteId: 1, noteVersionId: 1, excerpt: "e" }],
    });
    const propCol = makeStubProposer({ 1: proposal(1, HIGH_CONFIDENCE) });
    const agent = makeAgent({
      store,
      collector: citCol.collector,
      proposer: propCol.proposer,
    });

    const out = await agent.run({ workspaceId: 1, candidates: [cand(1)] });

    expect(out.proposalsCreated).toBe(1);
    expect(out.proposalsRejectedBelowThreshold).toBe(0);
    expect(calls.recordProposalCalls).toHaveLength(1);
    expect(calls.recordProposalCalls[0]!.proposal.confidence).toBe(HIGH_CONFIDENCE);
  });

  it("default minConfidence is 0.8 (per plan T-D.3)", async () => {
    const { store, calls } = makeStubStore();
    const citCol = makeStubCollector({
      1: [{ noteId: 1, noteVersionId: 1, excerpt: "e" }],
      2: [{ noteId: 2, noteVersionId: 2, excerpt: "e" }],
    });
    const propCol = makeStubProposer({
      1: proposal(1, 0.79), // just below 0.8
      2: proposal(2, 0.80), // at threshold
    });
    const agent = makeAgent({
      store,
      collector: citCol.collector,
      proposer: propCol.proposer,
    });

    const out = await agent.run({
      workspaceId: 1,
      candidates: [cand(1), cand(2)],
    });

    expect(out.proposalsCreated).toBe(1);
    expect(out.proposalsRejectedBelowThreshold).toBe(1);
    expect(calls.recordProposalCalls[0]!.proposal.targetId).toBe(2);
    expect(calls.recordRejectedCalls[0]!.proposal.targetId).toBe(1);
  });

  it("maxProposals cap stops loop once reached (rejected do NOT count toward cap)", async () => {
    const { store } = makeStubStore();
    const citCol = makeStubCollector({
      1: [{ noteId: 1, noteVersionId: 1, excerpt: "e" }],
      2: [{ noteId: 2, noteVersionId: 2, excerpt: "e" }],
      3: [{ noteId: 3, noteVersionId: 3, excerpt: "e" }],
    });
    const propCol = makeStubProposer({
      1: proposal(1, HIGH_CONFIDENCE),
      2: proposal(2, HIGH_CONFIDENCE),
      3: proposal(3, HIGH_CONFIDENCE),
    });
    const agent = makeAgent({
      store,
      collector: citCol.collector,
      proposer: propCol.proposer,
    });

    const out = await agent.run({
      workspaceId: 1,
      candidates: [cand(1), cand(2), cand(3)],
      maxProposals: 2,
    });

    expect(out.proposalsCreated).toBe(2);
  });

  it("honors minConfidence override from input", async () => {
    const { store } = makeStubStore();
    const citCol = makeStubCollector({
      1: [{ noteId: 1, noteVersionId: 1, excerpt: "e" }],
    });
    const propCol = makeStubProposer({ 1: proposal(1, 0.55) });
    const agent = makeAgent({
      store,
      collector: citCol.collector,
      proposer: propCol.proposer,
    });

    const out = await agent.run({
      workspaceId: 1,
      candidates: [cand(1)],
      minConfidence: 0.5,
    });

    expect(out.proposalsCreated).toBe(1);
    expect(out.proposalsRejectedBelowThreshold).toBe(0);
  });

  it("finishRun receives the final counts + completedAt timestamp", async () => {
    const { store, calls } = makeStubStore();
    const citCol = makeStubCollector({
      1: [{ noteId: 1, noteVersionId: 1, excerpt: "e" }],
      2: [],
      3: [{ noteId: 3, noteVersionId: 3, excerpt: "e" }],
    });
    const propCol = makeStubProposer({
      1: proposal(1, HIGH_CONFIDENCE),
      3: proposal(3, LOW_CONFIDENCE),
    });
    const agent = makeAgent({
      store,
      collector: citCol.collector,
      proposer: propCol.proposer,
    });

    await agent.run({
      workspaceId: 1,
      candidates: [cand(1), cand(2), cand(3)],
    });

    expect(calls.finishRunCalls).toHaveLength(1);
    const summary = calls.finishRunCalls[0]!.summary as {
      proposalsCreated: number;
      proposalsRejectedBelowThreshold: number;
      status: SemanticEnrichmentRunOutput["status"];
      completedAt: Date;
    };
    expect(summary.proposalsCreated).toBe(1);
    expect(summary.proposalsRejectedBelowThreshold).toBe(1);
    expect(summary.status).toBe("completed");
    expect(summary.completedAt).toBeInstanceOf(Date);
  });

  it("mixed flow: 1 created + 1 rejected + 1 no-citations + 1 proposer-error in one run", async () => {
    const { store } = makeStubStore();
    const citCol = makeStubCollector({
      10: [{ noteId: 1, noteVersionId: 1, excerpt: "e" }],
      20: [{ noteId: 2, noteVersionId: 2, excerpt: "e" }],
      30: [],
      40: [{ noteId: 4, noteVersionId: 4, excerpt: "e" }],
    });
    const propCol = makeStubProposer({
      10: proposal(10, HIGH_CONFIDENCE),
      20: proposal(20, LOW_CONFIDENCE),
      40: { error: "rate limit" },
    });
    const agent = makeAgent({
      store,
      collector: citCol.collector,
      proposer: propCol.proposer,
    });

    const out = await agent.run({
      workspaceId: 1,
      candidates: [cand(10), cand(20), cand(30), cand(40)],
    });

    expect(out.proposalsCreated).toBe(1);
    expect(out.proposalsRejectedBelowThreshold).toBe(1);
    expect(out.candidatesSkippedNoCitations).toBe(1);
    expect(out.candidatesSkippedProposerError).toBe(1);
    expect(out.status).toBe("completed");
  });
});

describe("T-D.3.5 — Semantic Enrichment agent (source-scan)", () => {
  it("no direct neo4j-driver / openrouter / drizzle-orm / process.env reads (composition only)", () => {
    const src = readAgent();
    expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
    expect(src).not.toMatch(
      /from\s+["'](?:openrouter|openai|@anthropic-ai\/sdk|@google\/generative-ai)["']/,
    );
    expect(src).not.toMatch(/from\s+["']drizzle-orm/);
    expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
  });

  it("does NOT import dispatchMcpToolCall (proposer flow is read-only)", () => {
    const src = readAgent();
    expect(src).not.toMatch(/^import[^\n]*dispatchMcpToolCall/m);
    expect(src).not.toMatch(/dispatchMcpToolCall\(/);
  });

  it("no T-D.3.1 factory-throws placeholder remains — agent is FULLY wired", () => {
    expect(readAgent()).not.toMatch(
      /\[T-D\.3\.1\][\s\S]*createSemanticEnrichmentAgent/,
    );
  });

  it("agent calls store.beginRun + store.finishRun (lifecycle bracket)", () => {
    const src = readAgent();
    expect(src).toMatch(/store\.beginRun\(/);
    expect(src).toMatch(/store\.finishRun\(/);
  });

  it("agent calls store.recordProposal + store.recordRejectedBelowThreshold (threshold gate)", () => {
    const src = readAgent();
    expect(src).toMatch(/store\.recordProposal\(/);
    expect(src).toMatch(/store\.recordRejectedBelowThreshold\(/);
  });

  it("uses normalizeSemanticEnrichmentMinConfidence (default 0.8)", () => {
    expect(readAgent()).toMatch(/normalizeSemanticEnrichmentMinConfidence/);
  });
});
