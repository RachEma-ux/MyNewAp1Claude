/**
 * Semantic Enrichment LLM proposer — T-D.3.1 skeleton (factory-throws).
 *
 * Turns (target node + collected evidence) into a typed
 * SemanticEnrichmentProposal. Flipped in T-D.3.4 with the actual
 * LLM call routed through OpenRouter Model Access.
 *
 * Hard rules:
 *   - LLM access ONLY through OpenRouter Model Access boundary
 *     (the `modelAccess` factory option). No direct openrouter
 *     SDK import; no other provider SDKs.
 *   - No process.env reads — credential resolution is the model
 *     access surface's responsibility.
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

export interface CreateSemanticEnrichmentProposerOptions {
  readonly modelAccess: unknown;
}

export function createSemanticEnrichmentProposer(
  _options: CreateSemanticEnrichmentProposerOptions,
): SemanticEnrichmentProposer {
  return {
    async propose() {
      throw new Error(
        "[T-D.3.1] createSemanticEnrichmentProposer — propose placeholder; wired in T-D.3.4",
      );
    },
  };
}
