/**
 * Extension lane hook contracts — V1+ 18-γ-contracts (PR-V1-42).
 *
 * Pins the typed contract surface each non-tool lane hook must
 * satisfy. The `tool` lane is intentionally absent — `lane="tool"`
 * always routes through the MCP dispatcher (per `runtime.ts` +
 * `lane-hooks.ts` invariant) and never a lane hook.
 *
 * See `docs/architecture/agent-studio-extension-lane-hook-contracts.md`
 * for the decision rationale.
 *
 * Hard-rule compliance:
 *   - Type-only imports of RAC + CAG canonical types. The runtime
 *     boundary is preserved — this file does not pull RAC or CAG
 *     into the extension hard-rule surface at runtime.
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY`
 *     / `neo4j-driver` / `openrouter` / `GraphRepository` imports.
 */

// Type-only — the runtime boundary stays at the registrant.
import type {
  RetrievalPlanItem,
} from "../rac/retrieval-planner.js";
import type { BuildPackInput } from "../cag/builder.js";
import type { ExtensionRecord, InvokeFromExtensionInput } from "./contracts.js";
import type { LaneHookOutcome } from "./lane-hooks.js";

// ============================================================================
// Closed lane subset (tool is forbidden in registry → not in contracts)
// ============================================================================

export const CONTRACTED_EXTENSION_LANES = [
  "retrieve",
  "assemble",
  "compose",
] as const;

export type ContractedExtensionLane =
  (typeof CONTRACTED_EXTENSION_LANES)[number];

// ============================================================================
// Retrieve lane contract
// ============================================================================

/**
 * Provenance fields every extension-contributed retrieval chunk
 * MUST carry. Mirrors the canonical chunk shape so the existing
 * `retrieval-filter.ts` governance + permission filter can apply
 * without special-casing extension chunks.
 */
export interface ContractedChunkProvenance {
  readonly sourceType: string;
  readonly sourceId: string;
  /** Optional version id for the chunk's source. */
  readonly sourceVersionId?: string;
  /** Freshness anchor — when the chunk was authored. */
  readonly authoredAt?: Date;
}

/**
 * Extension-contributed retrieval chunk. Subset of `RacRetrievalChunk`
 * shape — extensions provide only what they author; the filter +
 * assembler step adds provenance audit + permission decoration.
 */
export interface ContractedRetrievalChunk {
  readonly content: string;
  readonly score?: number;
  readonly provenance: ContractedChunkProvenance;
}

/**
 * Retrieve-lane outcome. Returns supplemental plan items + chunks
 * that the RAC pipeline merges INTO the operator-built plan +
 * filter pipeline. Hooks cannot replace the plan — only supplement.
 */
export interface ContractedRetrieveOutcome extends LaneHookOutcome {
  /** Supplemental plan items merged INTO the existing plan. The
   *  filter step still applies governance + permission filtering. */
  readonly supplementalPlanItems?: ReadonlyArray<RetrievalPlanItem>;
  /** Direct chunk contributions (for sources too small to model as
   *  a plan item). Each chunk MUST carry provenance for citation. */
  readonly supplementalChunks?: ReadonlyArray<ContractedRetrievalChunk>;
}

// ============================================================================
// Assemble lane contract
// ============================================================================

/**
 * Assemble-lane outcome. Returns supplemental evidence chunks
 * merged INTO `AssembledRetrievalEvidence.chunks` AFTER the standard
 * assembler runs. The freshness + citation policy applies to every
 * contributed chunk.
 */
export interface ContractedAssembleOutcome extends LaneHookOutcome {
  readonly supplementalChunks?: ReadonlyArray<ContractedRetrievalChunk>;
  /** Optional tokens-attributed value the registrant claims for the
   *  contribution. The assembler enforces the
   *  `RAC_MAX_RETRIEVAL_EVIDENCE_TOKENS` cap; oversize contributions
   *  are truncated. */
  readonly tokensAttributed?: number;
}

// ============================================================================
// Compose lane contract
// ============================================================================

/**
 * Compose-lane outcome. Returns supplemental CAG block contributions
 * merged INTO the pack's `userBlocks` slot. CAG hash invariant
 * preserved — a different contribution produces a different pack id.
 */
export interface ContractedComposeOutcome extends LaneHookOutcome {
  /** Block contributions in CAG `BuildPackInput.userBlocks` shape.
   *  The builder hashes the final pack including these blocks. */
  readonly supplementalBlocks?: BuildPackInput["userBlocks"];
}

// ============================================================================
// Discriminated lane hook function type
// ============================================================================

export type ContractedLaneHookOutcome =
  | ContractedRetrieveOutcome
  | ContractedAssembleOutcome
  | ContractedComposeOutcome;

/**
 * Lane-typed hook function. Use this at the registrant boundary so
 * the compiler enforces the per-lane outcome shape:
 *
 *   const retrieveHook: ContractedLaneHookFn<"retrieve"> = async ({ ... }) => ({
 *     succeeded: true,
 *     supplementalPlanItems: [...],
 *   });
 *
 *   registerLaneHook("retrieve", retrieveHook);
 *
 * The `tool` lane is excluded from the type. Attempting
 * `ContractedLaneHookFn<"tool">` is a compile-time error.
 */
export type ContractedLaneHookFn<Lane extends ContractedExtensionLane> =
  (params: {
    readonly extension: ExtensionRecord;
    readonly input: InvokeFromExtensionInput;
  }) => Promise<
    Lane extends "retrieve"
      ? ContractedRetrieveOutcome
      : Lane extends "assemble"
        ? ContractedAssembleOutcome
        : Lane extends "compose"
          ? ContractedComposeOutcome
          : never
  >;
