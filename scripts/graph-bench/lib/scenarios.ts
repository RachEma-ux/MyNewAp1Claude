/**
 * Graph Backend Benchmark Harness — scenario library.
 *
 * SKELETON. Phase 7+ implementations replace stubs with real workloads
 * once the typed graph store + projection sync layer ships.
 */

import type { BenchmarkScenario } from "./types.js";

export const SCENARIOS: BenchmarkScenario[] = [
  {
    key: "note_open",
    description: "Open note with 5,000 words + 50 links",
    targetP50Ms: 300,
    targetP95Ms: 800,
    run: async (_repo) => ({ durationMs: 0, resultCount: 0 }),
  },
  {
    key: "backlinks_refresh",
    description: "Refresh backlinks after saving 100-link note",
    targetP50Ms: 500,
    targetP95Ms: 1500,
    run: async (_repo) => ({ durationMs: 0, resultCount: 0 }),
  },
  {
    key: "note_projection_to_neo4j",
    description: "Project a note update",
    targetP50Ms: 500,
    targetP95Ms: 2000,
    run: async (_repo) => ({ durationMs: 0, resultCount: 0 }),
  },
  {
    key: "local_graph_depth_2",
    description: "Render depth-2 local graph (≤500 nodes)",
    targetP50Ms: 700,
    targetP95Ms: 2000,
    run: async (repo) => {
      const start = Date.now();
      const r = await repo.localGraph("seed", { maxDepth: 2, maxResults: 500 }, { userRole: "admin" });
      return { durationMs: Date.now() - start, resultCount: r.nodes.length };
    },
  },
  {
    key: "permission_aware_depth_3",
    description: "Depth-3 traversal with permission filter",
    targetP50Ms: 900,
    targetP95Ms: 2500,
    run: async (repo) => {
      const start = Date.now();
      const r = await repo.localGraph("seed", { maxDepth: 3, maxResults: 1000 }, { userRole: "reader" });
      return { durationMs: Date.now() - start, resultCount: r.nodes.length };
    },
  },
  {
    key: "search_10k_notes",
    description: "Full-text search across 10k notes",
    targetP50Ms: 300,
    targetP95Ms: 1200,
    run: async (_repo) => ({ durationMs: 0, resultCount: 0 }),
  },
  {
    key: "graphrag_retrieval",
    description: "Hybrid graph + note retrieval",
    targetP50Ms: 800,
    targetP95Ms: 2500,
    run: async (_repo) => ({ durationMs: 0, resultCount: 0 }),
  },
  {
    key: "cypher_template",
    description: "Cypher query template execution",
    targetP50Ms: 300,
    targetP95Ms: 1200,
    run: async (repo) => {
      const start = Date.now();
      const r = await repo.executeTemplate({
        templateKey: "local_graph_depth_2",
        parameters: { seed: "seed" },
        runtime: { userRole: "admin" },
      });
      return { durationMs: Date.now() - start, resultCount: r.rows.length };
    },
  },
  {
    key: "runtime_trace_load",
    description: "Runtime trace graph load (10k traces)",
    targetP50Ms: 500,
    targetP95Ms: 1500,
    run: async (_repo) => ({ durationMs: 0, resultCount: 0 }),
  },
  {
    key: "entity_resolution_scan",
    description: "Entity resolution candidate scan",
    targetP50Ms: 1000,
    targetP95Ms: 4000,
    run: async (_repo) => ({ durationMs: 0, resultCount: 0 }),
  },
];

export function getScenarios(keys?: string[]): BenchmarkScenario[] {
  if (!keys || keys.length === 0 || keys.includes("all")) return SCENARIOS;
  return SCENARIOS.filter((s) => keys.includes(s.key));
}

export interface ScenarioKeyValidation {
  readonly valid: string[];
  readonly unknown: string[];
  readonly resolved: BenchmarkScenario[];
}

/**
 * Strict-mode key validation for CLI / workflow callers.
 *
 * `getScenarios()` silently returns an empty array for unknown keys —
 * useful for permissive library callers, dangerous for the CLI
 * because it pairs with the runner's "0 scenarios = silent pass"
 * historical bug. This function is the loud-failure variant: it
 * splits the requested keys into `valid` + `unknown` so the CLI can
 * reject the run before scenarios execute.
 *
 * `["all"]` is treated as "all canonical scenarios" — no unknowns
 * reported. `[]` is treated the same way (matches `getScenarios`
 * permissive semantics). Anything else must match a scenario key
 * exactly or be reported as unknown.
 *
 * Acceptance: G3 benchmark runbook §6 + closure mission acceptance
 * criteria — "unknown scenario keys must fail loudly".
 */
export function validateScenarioKeys(keys: string[]): ScenarioKeyValidation {
  if (keys.length === 0 || keys.includes("all")) {
    return { valid: SCENARIOS.map((s) => s.key), unknown: [], resolved: SCENARIOS };
  }
  const known = new Set(SCENARIOS.map((s) => s.key));
  const valid: string[] = [];
  const unknown: string[] = [];
  for (const k of keys) {
    if (known.has(k)) valid.push(k);
    else unknown.push(k);
  }
  const resolved = SCENARIOS.filter((s) => valid.includes(s.key));
  return { valid, unknown, resolved };
}
