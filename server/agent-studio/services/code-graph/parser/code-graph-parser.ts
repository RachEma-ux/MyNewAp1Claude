/**
 * Code Graph Parser — production interface (T-G.2.1).
 *
 * Pins the surface T-G.2.2 must implement. The actual tree-sitter
 * production wrapper lives here (graduated from `spike/parse-ts-file.ts`)
 * once T-G.2.2 ships. Today this module is the interface + a
 * deliberate `not-yet-implemented` factory so consumers can compile
 * against the shape before the implementation lands.
 *
 * Why a separate `parser/` directory instead of graduating
 * `spike/parse-ts-file.ts` in place:
 *   - The spike file is a single-file standalone (no cross-file
 *     symbol resolution, no import-path normalization). The
 *     production parser needs those; T-G.2.2 will add them.
 *   - The spike file remains a frozen reference for the T-E
 *     measurement transcripts. Editing it would invalidate the
 *     measurement record.
 *   - Production code imports from `services/code-graph/parser/`;
 *     the spike directory remains the test-bench escape hatch.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `tree-sitter` import here (parser is delegated; the
 *     implementation in T-G.2.2 will import it locally inside
 *     this file).
 *   - No `neo4j-driver` import (parsing is local-CPU only;
 *     projection lives in `projection/`).
 *   - No `dispatchMcpToolCall` (parser does not execute tools).
 *   - No `process.env.*_API_KEY` reads.
 */

import type {
  CodeGraphNodeType,
  CodeGraphEdgeType,
} from "../contracts/code-intelligence-contracts.js";

/**
 * A parsed node — keyed by stable `id` (caller-derived, typically
 * `${typeKey}:${filePath}:${name}` for symbols, `${typeKey}:${filePath}`
 * for files). T-G.2.3 persists these into ASDB; T-G.2.4 projects
 * them into Neo4j via GraphRepository.
 */
export interface ParsedCodeNode {
  readonly id: string;
  readonly typeKey: CodeGraphNodeType;
  readonly name: string;
  readonly filePath: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly properties?: Readonly<Record<string, unknown>>;
}

/**
 * A parsed edge — closed-taxonomy relationship between two parsed
 * nodes. The `(sourceId, edgeTypeKey, targetId)` triple is the
 * stable key; duplicate triples within a batch are deduped by
 * T-G.2.3 before persistence.
 */
export interface ParsedCodeEdge {
  readonly id: string;
  readonly sourceId: string;
  readonly edgeTypeKey: CodeGraphEdgeType;
  readonly targetId: string;
  readonly properties?: Readonly<Record<string, unknown>>;
}

/**
 * Per-file parse error. The production parser must NOT throw on
 * parser-internal failures (tree-sitter throws "Invalid argument"
 * on >35KB or non-standard syntax files — see T-E.5 fix at
 * `spike/run-sample-ingest.ts`). Instead, surface the failure as
 * a `ParseError` row so the orchestrator can decide to skip,
 * retry, or escalate.
 */
export interface ParseError {
  readonly filePath: string;
  readonly reason:
    | "parser_internal_error"
    | "unsupported_language"
    | "file_too_large"
    | "io_error";
  readonly message: string;
}

export interface ParseFileResult {
  readonly nodes: ReadonlyArray<ParsedCodeNode>;
  readonly edges: ReadonlyArray<ParsedCodeEdge>;
  readonly errors: ReadonlyArray<ParseError>;
}

export interface CodeGraphParser {
  /**
   * Parse a single file into nodes + edges. The implementation may
   * be language-specific (TS/JS via tree-sitter today; T-G.2.2's
   * follow-ups add Python / Go via the same surface).
   *
   * `filePath` is the absolute path; the parser derives the
   * normalized import key from it (T-G.2.2). `source` is the file
   * text (callers read the file; the parser does no I/O so it
   * stays pure + testable).
   */
  parseFile(filePath: string, source: string): ParseFileResult;
}

/**
 * Factory entry point. T-G.2.2 returns the real tree-sitter-backed
 * implementation; today it throws so callers can wire-without-using
 * during T-G.2.1.
 */
export function createCodeGraphParser(): CodeGraphParser {
  throw new Error(
    "[T-G.2.1] CodeGraphParser is the T-G.2.1 interface contract only; the production implementation lands in T-G.2.2.",
  );
}
