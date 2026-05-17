/**
 * Code Graph Parser — production interface + tree-sitter wiring.
 *
 * Surface contract pinned at T-G.2.1. T-G.2.2 (this PR) wires the
 * factory to a real tree-sitter implementation by delegating to
 * `tree-sitter-emitter.ts` (the sole tree-sitter callsite in
 * production code-graph).
 *
 * Why this file does NOT import `tree-sitter` directly:
 *   - `tree-sitter` is a native dep that fails to build on some
 *     dev environments (Termux, etc.). Keeping the import isolated
 *     to one sibling module (`tree-sitter-emitter.ts`) means
 *     callers that only need the interface surface can compile
 *     without the native binding being available at parse time.
 *   - The factory dynamically resolves the emitter via a top-level
 *     ESM import; environments where the native binding fails will
 *     surface the error at factory-call time, not module-load time.
 *
 * Why a separate `parser/` directory instead of graduating
 * `spike/parse-ts-file.ts` in place:
 *   - The spike file is a single-file standalone (no cross-file
 *     symbol resolution, no import-path normalization). The
 *     production parser surfaces parser-internal failures as
 *     `ParseError` rows so the orchestrator can skip files cleanly.
 *   - The spike file remains a frozen reference for the T-E
 *     measurement transcripts. Editing it would invalidate the
 *     measurement record.
 *   - Production code imports from `services/code-graph/parser/`;
 *     the spike directory remains the test-bench escape hatch.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - `tree-sitter` import lives in `tree-sitter-emitter.ts` only.
 *     Source-scan tested (see `tg-2-2-code-graph-parser-wired.test.ts`).
 *   - No `neo4j-driver` import (parsing is local-CPU only;
 *     projection lives in `projection/`).
 *   - No `dispatchMcpToolCall` (parser does not execute tools).
 *   - No `process.env.*_API_KEY` reads.
 */

import { emitFromTypeScriptSource } from "./tree-sitter-emitter.js";

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
 * Factory entry point. Returns a tree-sitter-backed parser. The
 * caller is responsible for reading the file text and passing it
 * in — the parser is pure (no I/O) so unit tests can pass inline
 * source strings.
 *
 * Parse-error tolerance: tree-sitter throws "Invalid argument" on
 * some inputs (>35KB or non-standard syntax — see the T-E.5 spike
 * fix). The parser catches the throw and surfaces it as a
 * `ParseError` row so the orchestrator can skip the file cleanly.
 */
export function createCodeGraphParser(): CodeGraphParser {
  return {
    parseFile(filePath: string, source: string): ParseFileResult {
      try {
        const { nodes, edges } = emitFromTypeScriptSource(filePath, source);
        return { nodes, edges, errors: [] };
      } catch (err) {
        const message = (err as Error)?.message ?? String(err);
        const reason: ParseError["reason"] =
          /too large|exceeds|invalid argument/i.test(message)
            ? "file_too_large"
            : "parser_internal_error";
        return {
          nodes: [],
          edges: [],
          errors: [{ filePath, reason, message }],
        };
      }
    },
  };
}
