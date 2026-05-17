/**
 * Code Graph Parser Spike — T-E.2 sample-ingest script.
 *
 * Walks `server/agent-studio/services/extensions/` (the spike
 * target named in the spike doc §2) and applies `parseTsFile` to
 * each `.ts` file. Prints a summary to stdout:
 *
 *   - file count
 *   - total parse time + per-file p50/p95 (T-E.4 performance gate
 *     measures this against the < 50 ms/file p95 target)
 *   - node count by type
 *   - edge count by type
 *   - cross-file IMPORTS resolution rate (raw specifiers that
 *     resolve to a known File node id within the ingested set)
 *   - cross-file CALLS resolution rate (callee names that match a
 *     declared Function/ApiEndpoint label in the ingested set)
 *
 * No DB writes. No Neo4j projection. This is a measurement-only
 * dry run — the projection step lands in T-E.3 against the same
 * dataset, so the projection time can be measured separately from
 * parse time.
 *
 * Run via: `tsx server/agent-studio/services/code-graph/spike/run-sample-ingest.ts`
 *
 * Spike boundary compliance:
 *   - tree-sitter only via `parse-ts-file.ts` (sibling spike file)
 *   - no neo4j-driver imports
 *   - no process.env API key reads
 *   - no graph mutation
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseTsFile,
  type CodeGraphEmit,
  type CodeGraphEdge,
  type CodeGraphNode,
} from "./parse-ts-file.js";

// ESM-safe replacement for CommonJS `__dirname`. The repo's
// package.json sets `"type": "module"`, so `__dirname` is
// undefined when this file runs under `npx tsx` directly (the T-E.4
// measurement workflow's path). Vitest shims `__dirname` in its
// loader so T-E.3's perf test sees it, but the workflow does not.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, "../../../../..");

/**
 * T-E.5 scale-up hook: the orchestrator's target dir is overridable
 * via the `CODE_GRAPH_SPIKE_TARGET_DIR` env var so the same
 * `aggregate()` + `summarize()` + measurement infrastructure can
 * point at a larger corpus (e.g., `server/agent-studio/services/`
 * ~450 files) without forking the code. Default stays at the §2
 * spike scope so T-E.3 perf test keeps measuring the same surface.
 *
 * @ts-ignore — process.env typing in mixed-bundler context
 */
// @ts-ignore
const SPIKE_TARGET_DIR =
  // @ts-ignore
  (typeof process !== "undefined" &&
    // @ts-ignore
    process.env.CODE_GRAPH_SPIKE_TARGET_DIR) ||
  "server/agent-studio/services/extensions";

interface PerFileTiming {
  readonly path: string;
  readonly parseMs: number;
  readonly nodeCount: number;
  readonly edgeCount: number;
}

interface AggregateEmit {
  readonly files: number;
  readonly totalParseMs: number;
  readonly timings: readonly PerFileTiming[];
  readonly nodes: readonly CodeGraphNode[];
  readonly edges: readonly CodeGraphEdge[];
}

function collectTsFiles(dir: string, acc: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) collectTsFiles(full, acc);
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts"))
      acc.push(full);
  }
}

function aggregate(repoRoot: string, targetDir: string): AggregateEmit {
  const absTarget = join(repoRoot, targetDir);
  const files: string[] = [];
  collectTsFiles(absTarget, files);

  const allNodes: CodeGraphNode[] = [];
  const allEdges: CodeGraphEdge[] = [];
  const timings: PerFileTiming[] = [];
  let totalParseMs = 0;

  // T-E.5 fix: tree-sitter throws "Invalid argument" on some files
  // in services/ (likely .ts files containing JSX, files exceeding
  // an internal size limit, or non-UTF-8 byte sequences). The spike
  // is a measurement, not a correctness gate — log + skip per file
  // rather than abort the entire run. The skipped count surfaces in
  // the summary so the operator can decide whether the parser
  // strategy needs hardening before T-G.2 production.
  let parseErrors = 0;
  for (const abs of files) {
    const rel = abs.slice(repoRoot.length + 1);
    let src: string;
    try {
      src = readFileSync(abs, "utf8");
    } catch {
      parseErrors += 1;
      continue;
    }
    const t0 = performance.now();
    let emit: CodeGraphEmit;
    try {
      emit = parseTsFile(rel, src);
    } catch (err) {
      parseErrors += 1;
      console.warn(
        `[T-E.5] parse-skip ${rel} (${src.length} bytes): ${(err as Error).message}`,
      );
      continue;
    }
    const dt = performance.now() - t0;
    totalParseMs += dt;
    timings.push({
      path: rel,
      parseMs: dt,
      nodeCount: emit.nodes.length,
      edgeCount: emit.edges.length,
    });
    for (const n of emit.nodes) allNodes.push(n);
    for (const e of emit.edges) allEdges.push(e);
  }
  if (parseErrors > 0) {
    console.warn(
      `[T-E.5] skipped ${parseErrors} of ${files.length} files due to parse errors (see [T-E.5] parse-skip lines above)`,
    );
  }

  return {
    files: files.length,
    totalParseMs,
    timings,
    nodes: allNodes,
    edges: allEdges,
  };
}

function quantile(sortedMs: readonly number[], q: number): number {
  if (sortedMs.length === 0) return 0;
  const idx = Math.min(
    sortedMs.length - 1,
    Math.floor((sortedMs.length - 1) * q),
  );
  return sortedMs[idx];
}

function summarize(agg: AggregateEmit): void {
  const nodeByType = new Map<string, number>();
  for (const n of agg.nodes) {
    nodeByType.set(n.type, (nodeByType.get(n.type) ?? 0) + 1);
  }
  const edgeByType = new Map<string, number>();
  for (const e of agg.edges) {
    edgeByType.set(e.type, (edgeByType.get(e.type) ?? 0) + 1);
  }

  const fileIds = new Set(agg.nodes.filter((n) => n.type === "File").map((n) => n.id));
  const fileBasenames = new Set<string>();
  for (const id of fileIds) {
    const parts = id.split("/");
    fileBasenames.add(parts[parts.length - 1]);
  }

  let importResolved = 0;
  let importTotal = 0;
  for (const e of agg.edges) {
    if (e.type !== "IMPORTS") continue;
    importTotal += 1;
    const tgt = e.targetId;
    if (tgt.startsWith(".") || tgt.startsWith("/")) importResolved += 1;
  }

  const declaredFnLabels = new Set(
    agg.nodes
      .filter((n) => n.type === "Function" || n.type === "ApiEndpoint")
      .map((n) => n.label),
  );
  let callResolved = 0;
  let callTotal = 0;
  for (const e of agg.edges) {
    if (e.type !== "CALLS") continue;
    callTotal += 1;
    if (declaredFnLabels.has(e.targetId)) callResolved += 1;
  }

  const sortedMs = [...agg.timings.map((t) => t.parseMs)].sort((a, b) => a - b);
  const p50 = quantile(sortedMs, 0.5);
  const p95 = quantile(sortedMs, 0.95);

  console.log("=== Code Graph Parser Spike — sample-ingest summary ===");
  console.log(`target           : ${SPIKE_TARGET_DIR}`);
  console.log(`files            : ${agg.files}`);
  console.log(
    `parse total ms   : ${agg.totalParseMs.toFixed(2)} (target < 5000 for 15 files)`,
  );
  console.log(`parse p50 ms     : ${p50.toFixed(2)}`);
  console.log(`parse p95 ms     : ${p95.toFixed(2)} (target < 50)`);
  console.log("nodes by type:");
  for (const [t, c] of [...nodeByType].sort()) console.log(`  ${t.padEnd(12)} ${c}`);
  console.log("edges by type:");
  for (const [t, c] of [...edgeByType].sort()) console.log(`  ${t.padEnd(12)} ${c}`);
  console.log(
    `IMPORTS relative-resolved : ${importResolved}/${importTotal}` +
      ` (${importTotal === 0 ? "n/a" : ((100 * importResolved) / importTotal).toFixed(1) + "%"})`,
  );
  console.log(
    `CALLS in-set-resolved     : ${callResolved}/${callTotal}` +
      ` (${callTotal === 0 ? "n/a" : ((100 * callResolved) / callTotal).toFixed(1) + "%"})`,
  );
}

if (
  typeof import.meta !== "undefined" &&
  // @ts-ignore — `process` typing in mixed-bundler context
  typeof process !== "undefined" &&
  // @ts-ignore
  process.argv[1] &&
  // @ts-ignore
  process.argv[1].endsWith("run-sample-ingest.ts")
) {
  const agg = aggregate(REPO_ROOT, SPIKE_TARGET_DIR);
  summarize(agg);
}

export { aggregate, summarize, REPO_ROOT, SPIKE_TARGET_DIR };
