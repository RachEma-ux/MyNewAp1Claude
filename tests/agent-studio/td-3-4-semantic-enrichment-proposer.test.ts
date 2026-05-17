/**
 * T-D.3.4 — Semantic Enrichment LLM proposer wire-up.
 *
 * Behavioral test for the OpenRouter Model Access-backed implementation
 * of SemanticEnrichmentProposer. Uses a stub `ProposerModelAccessExecutor`
 * to avoid live LLM calls.
 *
 * Validates:
 *   - propose() calls modelAccess.execute with intent="system-internal",
 *     correct providerConnectionId/modelRef/actorId from options,
 *     workspaceId from the input.
 *   - Response JSON is parsed; confidence clamped to [0,1]; citations
 *     are threaded through from input (never re-derived).
 *   - Code-fence-wrapped JSON still parses (model resilience).
 *   - Malformed JSON throws a tagged [T-D.3.4] error.
 *   - Provider error (status=error) throws a tagged error.
 *   - Missing modelAccess executor throws a tagged error.
 *
 * Source-scan: no direct openrouter SDK / process.env / neo4j-driver
 * / drizzle-orm / dispatchMcpToolCall imports anywhere.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  createSemanticEnrichmentProposer,
  type SemanticEnrichmentSourceCitation,
  type ProposeInput,
} from "../../server/agent-studio/services/graph-enrichment/public-api";

const PROPOSER_FILE = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-proposer.ts",
);

function readProposer(): string {
  return readFileSync(PROPOSER_FILE, "utf8");
}

interface RecordedCall {
  providerConnectionId: number;
  modelRef: string;
  messages: ReadonlyArray<{ role: string; content: string }>;
  intent: string;
  workspaceId: number;
  actorId: number;
  temperature?: number;
}

function makeStubExecutor(
  output: string | { status: "error"; error: string },
  recorded: { lastCall?: RecordedCall } = {},
) {
  return {
    async execute(input: RecordedCall) {
      recorded.lastCall = input;
      if (typeof output === "string") {
        return { status: "ok" as const, output };
      }
      return output;
    },
  };
}

function cite(noteId: number, excerpt = `note ${noteId}`): SemanticEnrichmentSourceCitation {
  return { noteId, noteVersionId: noteId, excerpt };
}

function makeInput(
  overrides: Partial<ProposeInput> = {},
): ProposeInput {
  return {
    workspaceId: 7,
    targetTypeKey: "note",
    targetId: 42,
    proposalKind: "description_enrichment",
    citations: [cite(1), cite(2)],
    ...overrides,
  };
}

const VALID_ENVELOPE = JSON.stringify({
  proposedChange: { description: "A clearer explanation." },
  confidence: 0.85,
  rationale: "Cited noteId=1 directly defines the concept.",
});

describe("T-D.3.4 — Semantic Enrichment proposer (behavioral)", () => {
  it("calls execute with intent=system-internal + provider+model from options", async () => {
    const recorded: { lastCall?: RecordedCall } = {};
    const executor = makeStubExecutor(VALID_ENVELOPE, recorded);
    const proposer = createSemanticEnrichmentProposer({
      modelAccess: executor,
      providerConnectionId: 99,
      modelRef: "anthropic/claude-haiku-4-5",
      actorId: 1,
    });

    await proposer.propose(makeInput());

    expect(recorded.lastCall).toBeDefined();
    expect(recorded.lastCall!.intent).toBe("system-internal");
    expect(recorded.lastCall!.providerConnectionId).toBe(99);
    expect(recorded.lastCall!.modelRef).toBe("anthropic/claude-haiku-4-5");
    expect(recorded.lastCall!.workspaceId).toBe(7);
    expect(recorded.lastCall!.actorId).toBe(1);
  });

  it("uses default temperature 0.2 when not provided", async () => {
    const recorded: { lastCall?: RecordedCall } = {};
    const proposer = createSemanticEnrichmentProposer({
      modelAccess: makeStubExecutor(VALID_ENVELOPE, recorded),
      providerConnectionId: 1,
      modelRef: "m",
      actorId: 1,
    });
    await proposer.propose(makeInput());
    expect(recorded.lastCall!.temperature).toBe(0.2);
  });

  it("honors temperature override from options", async () => {
    const recorded: { lastCall?: RecordedCall } = {};
    const proposer = createSemanticEnrichmentProposer({
      modelAccess: makeStubExecutor(VALID_ENVELOPE, recorded),
      providerConnectionId: 1,
      modelRef: "m",
      actorId: 1,
      temperature: 0.7,
    });
    await proposer.propose(makeInput());
    expect(recorded.lastCall!.temperature).toBe(0.7);
  });

  it("returns parsed proposal with confidence + rationale + threaded citations", async () => {
    const proposer = createSemanticEnrichmentProposer({
      modelAccess: makeStubExecutor(VALID_ENVELOPE),
      providerConnectionId: 1,
      modelRef: "m",
      actorId: 1,
    });
    const input = makeInput({
      citations: [cite(42, "exact source")],
    });
    const proposal = await proposer.propose(input);

    expect(proposal.kind).toBe("description_enrichment");
    expect(proposal.targetTypeKey).toBe("note");
    expect(proposal.targetId).toBe(42);
    expect(proposal.confidence).toBe(0.85);
    expect(proposal.rationale).toMatch(/Cited noteId=1/);
    expect(proposal.proposedChange).toEqual({
      description: "A clearer explanation.",
    });
    // Citations are passed THROUGH from input; proposer never re-derives.
    expect(proposal.citations).toEqual([cite(42, "exact source")]);
  });

  it("clamps confidence above 1 → 1", async () => {
    const env = JSON.stringify({
      proposedChange: { x: 1 },
      confidence: 1.5,
      rationale: "r",
    });
    const proposer = createSemanticEnrichmentProposer({
      modelAccess: makeStubExecutor(env),
      providerConnectionId: 1,
      modelRef: "m",
      actorId: 1,
    });
    const p = await proposer.propose(makeInput());
    expect(p.confidence).toBe(1);
  });

  it("clamps confidence below 0 → 0", async () => {
    const env = JSON.stringify({
      proposedChange: { x: 1 },
      confidence: -0.5,
      rationale: "r",
    });
    const proposer = createSemanticEnrichmentProposer({
      modelAccess: makeStubExecutor(env),
      providerConnectionId: 1,
      modelRef: "m",
      actorId: 1,
    });
    const p = await proposer.propose(makeInput());
    expect(p.confidence).toBe(0);
  });

  it("parses code-fence-wrapped JSON (model resilience)", async () => {
    const fenced = "```json\n" + VALID_ENVELOPE + "\n```";
    const proposer = createSemanticEnrichmentProposer({
      modelAccess: makeStubExecutor(fenced),
      providerConnectionId: 1,
      modelRef: "m",
      actorId: 1,
    });
    const p = await proposer.propose(makeInput());
    expect(p.confidence).toBe(0.85);
  });

  it("throws tagged [T-D.3.4] error on malformed JSON", async () => {
    const proposer = createSemanticEnrichmentProposer({
      modelAccess: makeStubExecutor("not json at all"),
      providerConnectionId: 1,
      modelRef: "m",
      actorId: 1,
    });
    await expect(proposer.propose(makeInput())).rejects.toThrow(/T-D\.3\.4/);
  });

  it("throws tagged [T-D.3.4] error on missing confidence in envelope", async () => {
    const env = JSON.stringify({ proposedChange: {}, rationale: "r" });
    const proposer = createSemanticEnrichmentProposer({
      modelAccess: makeStubExecutor(env),
      providerConnectionId: 1,
      modelRef: "m",
      actorId: 1,
    });
    await expect(proposer.propose(makeInput())).rejects.toThrow(/T-D\.3\.4/);
  });

  it("throws tagged error when provider returns status=error", async () => {
    const proposer = createSemanticEnrichmentProposer({
      modelAccess: makeStubExecutor({ status: "error", error: "rate-limit" }),
      providerConnectionId: 1,
      modelRef: "m",
      actorId: 1,
    });
    await expect(proposer.propose(makeInput())).rejects.toThrow(
      /T-D\.3\.4.*rate-limit/,
    );
  });

  it("throws tagged error when modelAccess is not an executor", async () => {
    const proposer = createSemanticEnrichmentProposer({
      modelAccess: {},
      providerConnectionId: 1,
      modelRef: "m",
      actorId: 1,
    });
    await expect(proposer.propose(makeInput())).rejects.toThrow(
      /T-D\.3\.4.*Model Access executor/,
    );
  });

  it("renders zero-citation input with explicit absence note in prompt", async () => {
    const recorded: { lastCall?: RecordedCall } = {};
    const proposer = createSemanticEnrichmentProposer({
      modelAccess: makeStubExecutor(VALID_ENVELOPE, recorded),
      providerConnectionId: 1,
      modelRef: "m",
      actorId: 1,
    });
    await proposer.propose(makeInput({ citations: [] }));
    const userMsg = recorded.lastCall!.messages.find((m) => m.role === "user")!;
    expect(userMsg.content).toMatch(/no citations available/);
  });
});

describe("T-D.3.4 — Semantic Enrichment proposer (source-scan)", () => {
  it("does NOT import the openrouter SDK or any provider SDK directly", () => {
    const src = readProposer();
    expect(src).not.toMatch(
      /from\s+["'](?:openrouter|openai|@anthropic-ai\/sdk|@google\/generative-ai)["']/,
    );
    // No direct import from server/openrouter/model-access either —
    // the executor is INJECTED via the modelAccess option to keep
    // the contracts file portable and the test seam in place.
    expect(src).not.toMatch(/from\s+["'][^"']*openrouter\/model-access/);
  });

  it("does NOT import dispatchMcpToolCall (proposer is read-only)", () => {
    const src = readProposer();
    expect(src).not.toMatch(/^import[^\n]*dispatchMcpToolCall/m);
    expect(src).not.toMatch(/dispatchMcpToolCall\(/);
  });

  it("does NOT read process.env API keys (credentials live on Model Access surface)", () => {
    expect(readProposer()).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
  });

  it("does NOT import drizzle-orm / neo4j-driver", () => {
    const src = readProposer();
    expect(src).not.toMatch(/from\s+["']drizzle-orm/);
    expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
  });

  it("uses intent: 'system-internal' for the Model Access call", () => {
    expect(readProposer()).toMatch(/intent:\s*["']system-internal["']/);
  });

  it("no T-D.3.1 factory-throws placeholder remains", () => {
    expect(readProposer()).not.toMatch(
      /\[T-D\.3\.1\][\s\S]*createSemanticEnrichmentProposer/,
    );
  });
});
