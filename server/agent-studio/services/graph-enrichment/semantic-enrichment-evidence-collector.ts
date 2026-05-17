/**
 * Semantic Enrichment evidence collector — T-D.3.1 skeleton (factory-throws).
 *
 * Reads source-note versions backing each candidate target node so
 * the proposer can cite them in the rationale. Flipped in T-D.3.3.
 *
 * Hard rules:
 *   - Read-only. No mutation of notes / versions / graph.
 *   - No openrouter / process.env imports. Read paths use existing
 *     KB / RAC retrieval surface.
 */

import type { SemanticEnrichmentSourceCitation } from "./contracts.js";

export interface EvidenceCollectionInput {
  readonly workspaceId: number;
  readonly targetTypeKey: string;
  readonly targetId: number;
  readonly maxCitations?: number;
}

export interface SemanticEnrichmentEvidenceCollector {
  collect(
    input: EvidenceCollectionInput,
  ): Promise<ReadonlyArray<SemanticEnrichmentSourceCitation>>;
}

export interface CreateSemanticEnrichmentEvidenceCollectorOptions {
  readonly noteVersionReader: unknown;
}

export function createSemanticEnrichmentEvidenceCollector(
  _options: CreateSemanticEnrichmentEvidenceCollectorOptions,
): SemanticEnrichmentEvidenceCollector {
  return {
    async collect() {
      throw new Error(
        "[T-D.3.1] createSemanticEnrichmentEvidenceCollector — collect placeholder; wired in T-D.3.3",
      );
    },
  };
}
