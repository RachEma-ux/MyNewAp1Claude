/**
 * RAC Context Assembler — Phase 5.
 *
 * Renders a list of filtered retrieval chunks into one
 * `SystemPromptSection` ready for the P1C composer's
 * `retrievalEvidence` slot. Per D-PRM-1, this is a *pure-transformation*
 * step — no I/O, no embedding calls, no DB reads. The composer caps
 * the section at D-PRM-3 §2 (1536 tokens for `retrieval-evidence`),
 * but we also enforce that cap here so the assembler itself never
 * hands the composer something it would have to truncate.
 *
 * Render shape (markdown so the model can latch onto it):
 *
 *   ## Retrieval Evidence
 *
 *   ### {citation}
 *   {content}
 *
 *   ### {citation}
 *   {content}
 *
 * Citations are passed through verbatim — the filter (P4) requires
 * non-empty citation metadata so this assembler never has to invent
 * one. When a citation looks malformed, we still emit it; the trace
 * picks up the warning.
 *
 * Budget enforcement (D-PRM-3 §2):
 *   - Chunks arrive sorted by score DESC (filter contract).
 *   - We greedy-pack chunks until the rendered section would exceed
 *     `RAC_MAX_RETRIEVAL_EVIDENCE_TOKENS = 1536`.
 *   - Dropped chunks generate a warning that lists the score floor
 *     of what made it in. P7 trace surfaces those warnings.
 *
 * Cache-key behaviour (D-PRM-5):
 *   - The composer EXCLUDES `retrieval-evidence` from the cache key.
 *   - The `contentHash` we compute here is informational (helps trace
 *     correlate identical evidence sets across turns); it does not
 *     enter the prompt prefix hash.
 */

import { createHash } from "crypto";
import type { SystemPromptSection } from "../cag";
import type { RacRetrievalChunk } from "./ingestion";

/** D-PRM-3 §2 cap on the retrieval-evidence section. */
export const RAC_MAX_RETRIEVAL_EVIDENCE_TOKENS = 1536;

/** Token estimate matching `services/cag/renderer.estimateTokens`. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export interface AssembleRetrievalEvidenceInput {
  chunks: RacRetrievalChunk[];
  /** Warnings forwarded from the executor + filter; the assembler appends to them. */
  warnings?: string[];
}

export interface AssembledRetrievalEvidence {
  /** Null when no chunks survived — composer simply omits the section. */
  section: SystemPromptSection | null;
  /** How many input chunks made it into the rendered text. */
  includedChunks: number;
  /** Chunks dropped solely by the assembler's budget (filter rejections aren't counted here). */
  droppedByBudget: number;
  warnings: string[];
}

export function assembleRetrievalEvidence(
  input: AssembleRetrievalEvidenceInput,
): AssembledRetrievalEvidence {
  const carriedWarnings = [...(input.warnings ?? [])];

  if (input.chunks.length === 0) {
    return {
      section: null,
      includedChunks: 0,
      droppedByBudget: 0,
      warnings: carriedWarnings,
    };
  }

  // Greedy pack within the D-PRM-3 budget. Filter sorts by score DESC,
  // but we don't depend on that — sort defensively so a caller passing
  // unsorted chunks still gets the highest-relevance head retained.
  const ordered = [...input.chunks].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.sourceChunkId.localeCompare(b.sourceChunkId);
  });

  const HEADER = "## Retrieval Evidence";
  const blocks: string[] = [];
  let runningTokens = estimateTokens(HEADER);
  let dropped = 0;
  let lowestIncludedScore: number | null = null;

  for (const chunk of ordered) {
    const block = renderBlock(chunk);
    const blockTokens = estimateTokens(block);
    if (runningTokens + blockTokens > RAC_MAX_RETRIEVAL_EVIDENCE_TOKENS) {
      dropped += 1;
      continue;
    }
    blocks.push(block);
    runningTokens += blockTokens;
    lowestIncludedScore = chunk.score;
  }

  if (blocks.length === 0) {
    // Even the highest-score chunk would have busted the budget. This
    // is a misconfigured agent (chunk_size or retrieval-evidence cap),
    // not a runtime error — surface a warning and bail.
    carriedWarnings.push(
      `assembler: every retrieval chunk exceeded the ${RAC_MAX_RETRIEVAL_EVIDENCE_TOKENS}-token budget alone; emitting empty retrieval-evidence`,
    );
    return {
      section: null,
      includedChunks: 0,
      droppedByBudget: ordered.length,
      warnings: carriedWarnings,
    };
  }

  if (dropped > 0) {
    const floor = lowestIncludedScore?.toFixed(3) ?? "n/a";
    carriedWarnings.push(
      `assembler: dropped ${dropped} retrieval chunk(s) over the ${RAC_MAX_RETRIEVAL_EVIDENCE_TOKENS}-token budget; lowest included score=${floor}`,
    );
  }

  const text = `${HEADER}\n\n${blocks.join("\n\n")}`;
  const tokenEstimate = estimateTokens(text);

  return {
    section: {
      id: "retrieval-evidence",
      text,
      tokenEstimate,
      contentHash: sha256Hex(text),
      warnings: carriedWarnings,
    },
    includedChunks: blocks.length,
    droppedByBudget: dropped,
    warnings: carriedWarnings,
  };
}

function renderBlock(chunk: RacRetrievalChunk): string {
  const heading = chunk.citation.trim() || "[uncited]";
  const body = chunk.content.trim();
  return `### ${heading}\n${body}`;
}
