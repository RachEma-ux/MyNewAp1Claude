/**
 * Semantic Enrichment LLM proposer — T-D.3.4 wire-up.
 *
 * Turns (target node + collected evidence) into a typed
 * SemanticEnrichmentProposal. Calls an LLM via the OpenRouter Model
 * Access boundary — the ONLY place LLM access is allowed per
 * CLAUDE.md hard rules.
 *
 * Boundary discipline:
 *   - The factory accepts a `ProposerModelAccessExecutor` (the
 *     minimal `execute(input)` slice). Production callers pass
 *     `{ execute }` from `server/openrouter/model-access`. Tests
 *     inject a stub.
 *   - No direct openrouter SDK import. No process.env reads.
 *     Credentials are resolved on the Model Access surface via
 *     `withProviderCredential` (Plan v3 D1) — never here.
 *   - intent="system-internal" because the proposer runs from cron
 *     / operator triggers, not user-attributed chat. This intent is
 *     exempt from the receipt policy per types.ts:26-43.
 *
 * Response contract:
 *   - The LLM is prompted to emit a JSON envelope containing
 *     `proposedChange`, `confidence`, `rationale`.
 *   - The proposer validates the envelope shape, clamps confidence
 *     into [0, 1], and threads the supplied `citations` into the
 *     output proposal (citations are the proposer's INPUT — the
 *     LLM only argues over them, never invents them).
 *
 * Failure modes:
 *   - Provider error → ModelAccessError surfaces; the agent runtime
 *     should catch and record a failed-proposal audit row.
 *   - Malformed JSON → `[T-D.3.4] proposer parse failed` thrown so
 *     the agent runtime can skip this candidate and continue.
 *   - Empty citations → the proposer still calls the LLM but the
 *     prompt explicitly notes the absence. The agent runtime should
 *     gate on citation count before invoking the proposer.
 */

import type {
  SemanticEnrichmentProposal,
  SemanticEnrichmentProposalKind,
  SemanticEnrichmentSourceCitation,
} from "./contracts.js";

export interface ProposeInput {
  readonly workspaceId: number;
  readonly targetTypeKey: string;
  readonly targetId: number;
  readonly proposalKind: SemanticEnrichmentProposalKind;
  readonly citations: ReadonlyArray<SemanticEnrichmentSourceCitation>;
}

export interface SemanticEnrichmentProposer {
  propose(input: ProposeInput): Promise<SemanticEnrichmentProposal>;
}

/**
 * Minimal slice of the Model Access surface this proposer needs.
 * Production callers pass `{ execute }` from
 * `server/openrouter/model-access`. The shape is intentionally
 * narrow so tests don't need to construct the full module.
 */
export interface ProposerModelAccessExecutor {
  execute(input: {
    providerConnectionId: number;
    modelRef: string;
    messages: ReadonlyArray<{
      role: "system" | "user";
      content: string;
    }>;
    intent: "system-internal";
    workspaceId: number;
    actorId: number;
    temperature?: number;
  }): Promise<{
    status: "ok" | "error";
    output?: string;
    error?: string;
  }>;
}

export interface CreateSemanticEnrichmentProposerOptions {
  readonly modelAccess: ProposerModelAccessExecutor | unknown;
  /** Provider connection used for enrichment proposals. */
  readonly providerConnectionId: number;
  /** Model ref (e.g., "anthropic/claude-haiku-4-5"). */
  readonly modelRef: string;
  /**
   * Actor id attributed to the system-internal call (used for
   * telemetry / audit; typically a service-account user). */
  readonly actorId: number;
  /** Optional temperature; defaults to 0.2 for deterministic proposals. */
  readonly temperature?: number;
}

interface ProposalEnvelope {
  proposedChange: Record<string, unknown>;
  confidence: number;
  rationale: string;
}

function isExecutor(v: unknown): v is ProposerModelAccessExecutor {
  return typeof v === "object" && v !== null && typeof (v as ProposerModelAccessExecutor).execute === "function";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function buildSystemPrompt(): string {
  return [
    "You are a graph-enrichment proposer for the Agent Studio knowledge graph.",
    "Given a target node and source evidence, produce ONE JSON-only response.",
    "Return STRICT JSON matching this shape (no prose, no code fence):",
    '{ "proposedChange": {...}, "confidence": <0..1>, "rationale": "..." }',
    "",
    "Rules:",
    "- Only propose changes that are directly supported by the citations.",
    "- confidence is your honest probability that the change is correct.",
    "- proposedChange is a partial node-property delta (the keys to set).",
    "- rationale must reference at least one citation by noteId.",
    "- If the evidence does not support a change, return confidence: 0.",
  ].join("\n");
}

function buildUserPrompt(input: ProposeInput): string {
  const parts: string[] = [
    `Target: ${input.targetTypeKey}:${input.targetId}`,
    `Proposal kind: ${input.proposalKind}`,
    `Workspace: ${input.workspaceId}`,
    "",
    "Citations:",
  ];
  if (input.citations.length === 0) {
    parts.push("(no citations available — return confidence: 0 with empty proposedChange)");
  } else {
    for (const c of input.citations) {
      parts.push(`- noteId=${c.noteId} versionId=${c.noteVersionId} excerpt="${c.excerpt}"`);
    }
  }
  return parts.join("\n");
}

function parseEnvelope(raw: string): ProposalEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Try to strip a leading/trailing code fence the model emitted
    // despite the prompt.
    const stripped = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "");
    try {
      parsed = JSON.parse(stripped);
    } catch {
      throw new Error("[T-D.3.4] proposer parse failed — non-JSON response");
    }
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("[T-D.3.4] proposer parse failed — envelope is not an object");
  }
  const env = parsed as Record<string, unknown>;
  if (typeof env.confidence !== "number") {
    throw new Error("[T-D.3.4] proposer parse failed — missing numeric confidence");
  }
  if (typeof env.rationale !== "string") {
    throw new Error("[T-D.3.4] proposer parse failed — missing string rationale");
  }
  if (!env.proposedChange || typeof env.proposedChange !== "object") {
    throw new Error("[T-D.3.4] proposer parse failed — missing object proposedChange");
  }
  return {
    proposedChange: env.proposedChange as Record<string, unknown>,
    confidence: clamp01(env.confidence),
    rationale: env.rationale,
  };
}

export function createSemanticEnrichmentProposer(
  options: CreateSemanticEnrichmentProposerOptions,
): SemanticEnrichmentProposer {
  return {
    async propose(input) {
      const executor = options.modelAccess;
      if (!isExecutor(executor)) {
        throw new Error(
          "[T-D.3.4] proposer requires a Model Access executor with .execute(input)",
        );
      }
      const result = await executor.execute({
        providerConnectionId: options.providerConnectionId,
        modelRef: options.modelRef,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(input) },
        ],
        intent: "system-internal",
        workspaceId: input.workspaceId,
        actorId: options.actorId,
        temperature: options.temperature ?? 0.2,
      });
      if (result.status !== "ok" || typeof result.output !== "string") {
        throw new Error(
          `[T-D.3.4] proposer execute failed: ${result.error ?? "no output"}`,
        );
      }
      const envelope = parseEnvelope(result.output);
      return {
        kind: input.proposalKind,
        targetTypeKey: input.targetTypeKey,
        targetId: input.targetId,
        proposedChange: envelope.proposedChange,
        confidence: envelope.confidence,
        rationale: envelope.rationale,
        citations: input.citations,
      };
    },
  };
}
