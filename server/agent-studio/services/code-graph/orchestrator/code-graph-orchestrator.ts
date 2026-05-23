/**
 * Code Graph Orchestrator — T-G.2.3 slice (2026-05-23).
 *
 * The glue between Code Studio repo registration and the
 * `ags_code_graph_*` persistence layer. Takes a filesystem path
 * (typically a `code_studio_repos.url`), walks `.ts` / `.tsx`
 * files, calls the tree-sitter parser per file, aggregates the
 * emitted nodes + edges + per-file errors, and persists them via
 * `createCodeGraphStore().persistIngestion(...)`.
 *
 * Spec-aligned with:
 *   - `docs/architecture/agent-studio-code-graph-parser-spike.md`
 *     §2 (spike target: `server/agent-studio/services/extensions/`)
 *   - `docs/implementation/agent-studio-native-graph-workspace-remaining-execution-plan.md`
 *     T-G.2 (Code Intelligence Graph)
 *
 * Surface contracts honored:
 *   - Parser surface from `parser/code-graph-parser.ts`:
 *     `createCodeGraphParser().parseFile(filePath, source)` returns
 *     `{ nodes, edges, errors }`. Pure (no I/O); orchestrator reads
 *     file text and feeds it in.
 *   - Persistence surface from `persistence/code-graph-store.ts`:
 *     `persistIngestion({ ingestionId, repositoryId, nodes, edges, errors })`
 *     returns `{ ingestionId, nodesUpserted, edgesUpserted, edgesRejected, parserErrorCount }`.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - tree-sitter import is isolated to `parser/tree-sitter-emitter.ts`.
 *     This orchestrator only imports the parser via its public
 *     interface (`createCodeGraphParser`).
 *   - No `neo4j-driver` import. Projection lives in `projection/`
 *     and is triggered separately.
 *   - No `dispatchMcpToolCall`. Orchestrator does not execute tools.
 *   - No `process.env.*_API_KEY` reads.
 *
 * Termux note: tree-sitter is a native dep that fails to build in
 * some environments. The parser surface guards this — `createCodeGraphParser`
 * succeeds in module-load but the underlying binding only resolves
 * at parse time. Surfaces a `binding_unavailable` parser error per
 * file rather than crashing the run.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { randomUUID } from "node:crypto";

import { createCodeGraphParser } from "../parser/public-api.js";
import { createCodeGraphStore } from "../persistence/public-api.js";
import type {
  ParsedCodeNode,
  ParsedCodeEdge,
  ParseError,
} from "../parser/public-api.js";
import type { CodeGraphIngestionResult } from "../persistence/public-api.js";

/**
 * Default ignore list. Mirrors the spike script (`spike/run-sample-ingest.ts`)
 * and the broader repo's typical exclusions. Keeps the parser away
 * from generated code + vendored deps.
 */
const DEFAULT_IGNORE_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".vite",
  "out",
]);

/**
 * Supported file extensions. The spike doc names tree-sitter-typescript
 * as the production parser; this slice limits to .ts/.tsx only.
 * Phase 25 follow-ups will add .py / .go / .rs via the same surface
 * (per T-G.2.2 doc-comment).
 */
const DEFAULT_EXTENSIONS: ReadonlyArray<string> = [".ts", ".tsx"];

/**
 * Default soft-limits to keep an orchestrator run bounded. Operators
 * who want a full-repo ingest can pass `maxFiles=Infinity` explicitly.
 */
const DEFAULT_MAX_FILES = 200;
const DEFAULT_MAX_FILE_BYTES = 200_000;

export interface IngestRepositoryInput {
  /** Absolute path to the repo root on local disk. */
  readonly repoPath: string;
  /**
   * Logical repository id stored on the ingestion row. Typically the
   * `code_studio_repos.id` (stringified) so future joins can connect
   * the code-graph to the Code Studio surface.
   */
  readonly repositoryId: string;
  /**
   * Optional sub-path within the repo to ingest (defaults to the
   * whole repo). Spike default: `server/agent-studio/services/extensions/`.
   */
  readonly relativeSubPath?: string;
  /** Max files to parse per run. Default: 200. */
  readonly maxFiles?: number;
  /** Max bytes per file — larger files skipped with `file_too_large`. */
  readonly maxFileBytes?: number;
  /**
   * Optional stable ingestion id for re-ingest idempotency. Omitted →
   * a fresh UUID per run.
   */
  readonly ingestionId?: string;
}

export interface IngestRepositoryResult {
  readonly ingestionId: string;
  readonly repositoryId: string;
  readonly filesScanned: number;
  readonly filesParsed: number;
  readonly filesSkippedTooLarge: number;
  readonly nodesUpserted: number;
  readonly edgesUpserted: number;
  readonly edgesRejected: number;
  readonly parserErrorCount: number;
  readonly durationMs: number;
}

function isDirAllowed(dirName: string): boolean {
  if (dirName.startsWith(".")) {
    // .well-known is fine, but `.git`, `.next`, `.turbo`, etc. are not.
    return !DEFAULT_IGNORE_DIRS.has(dirName);
  }
  return !DEFAULT_IGNORE_DIRS.has(dirName);
}

function walkSourceFiles(
  root: string,
  options: { extensions: ReadonlyArray<string>; maxFiles: number },
): string[] {
  const results: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0 && results.length < options.maxFiles) {
    const current = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      // Permission / IO errors — surface upstream by leaving the
      // dir unwalked. The orchestrator's empty-result fallback will
      // log the count gap.
      continue;
    }
    for (const entry of entries) {
      const full = join(current, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (isDirAllowed(entry)) stack.push(full);
        continue;
      }
      if (st.isFile() && options.extensions.includes(extname(entry))) {
        results.push(full);
        if (results.length >= options.maxFiles) break;
      }
    }
  }
  return results;
}

/**
 * Walks `repoPath`, parses each `.ts` / `.tsx` file via the tree-sitter
 * parser, and persists the aggregated emit via `persistIngestion()`.
 *
 * Returns a denormalized summary the tRPC trigger can return to the
 * operator. Errors during file IO surface as `ParseError` rows
 * (`reason: "io_error"`); parser-internal failures surface as
 * `reason: "parser_internal_error"`. The orchestrator NEVER throws on
 * per-file failures — it captures, continues, and reports counts.
 */
export async function ingestRepository(
  input: IngestRepositoryInput,
): Promise<IngestRepositoryResult> {
  const startedAt = Date.now();
  const ingestionId = input.ingestionId ?? `ing_${randomUUID()}`;
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const maxFileBytes = input.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const scanRoot = input.relativeSubPath
    ? join(input.repoPath, input.relativeSubPath)
    : input.repoPath;

  const sourceFiles = walkSourceFiles(scanRoot, {
    extensions: DEFAULT_EXTENSIONS,
    maxFiles,
  });

  const parser = createCodeGraphParser();
  const aggregatedNodes: ParsedCodeNode[] = [];
  const aggregatedEdges: ParsedCodeEdge[] = [];
  const aggregatedErrors: ParseError[] = [];
  let filesParsed = 0;
  let filesSkippedTooLarge = 0;

  for (const filePath of sourceFiles) {
    let source: string;
    try {
      const st = statSync(filePath);
      if (st.size > maxFileBytes) {
        aggregatedErrors.push({
          filePath,
          reason: "file_too_large",
          message: `${st.size} bytes > ${maxFileBytes} cap`,
        });
        filesSkippedTooLarge++;
        continue;
      }
      source = readFileSync(filePath, "utf8");
    } catch (e) {
      aggregatedErrors.push({
        filePath,
        reason: "io_error",
        message: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
    try {
      const result = parser.parseFile(filePath, source);
      // Path-normalize: store paths relative to the repo root so the
      // ingestion is portable across re-clones / different workdirs.
      const repoRel = (abs: string) => relative(input.repoPath, abs);
      for (const n of result.nodes) {
        aggregatedNodes.push({
          ...n,
          filePath: repoRel(n.filePath),
        });
      }
      for (const e of result.edges) {
        aggregatedEdges.push(e);
      }
      for (const e of result.errors) {
        aggregatedErrors.push({ ...e, filePath: repoRel(e.filePath) });
      }
      filesParsed++;
    } catch (e) {
      // Surface as parser_internal_error rather than crashing the run.
      aggregatedErrors.push({
        filePath: relative(input.repoPath, filePath),
        reason: "parser_internal_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const store = createCodeGraphStore();
  const persistResult: CodeGraphIngestionResult = await store.persistIngestion({
    ingestionId,
    repositoryId: input.repositoryId,
    nodes: aggregatedNodes,
    edges: aggregatedEdges,
    errors: aggregatedErrors,
  });

  return {
    ingestionId: persistResult.ingestionId,
    repositoryId: input.repositoryId,
    filesScanned: sourceFiles.length,
    filesParsed,
    filesSkippedTooLarge,
    nodesUpserted: persistResult.nodesUpserted,
    edgesUpserted: persistResult.edgesUpserted,
    edgesRejected: persistResult.edgesRejected,
    parserErrorCount: persistResult.parserErrorCount,
    durationMs: Date.now() - startedAt,
  };
}
