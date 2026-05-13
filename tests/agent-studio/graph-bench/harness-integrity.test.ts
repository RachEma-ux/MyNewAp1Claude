// Native Graph Workspace MVP 0 — Phase 1.4 / Phase 1.5 (G3).
//
// Source-scan integrity for the graph-bench harness at `scripts/graph-bench/`.
//
// The harness is the evidence-producing artifact for the G3 backend
// decision gate. The Neo4j CE benchmark runbook at
//   docs/runbooks/agent-studio-native-graph-workspace-neo4j-ce-benchmark-runbook.md
// (§9) names this exact test as the CI-safe guard against harness
// drift between operator runs.
//
// What this test does:
//   - Imports the scenario library + fixture spec; asserts shape.
//   - Pins the 10 scenario keys + their pass/fail target structure.
//   - Asserts p50 target < p95 target for every scenario (the bench
//     pass-criterion requires both; reversed targets would silently
//     declare every backend a pass).
//   - Pins DEFAULT_FIXTURE at 10k notes / 100k links / 50k nodes /
//     250k edges — the operator-spec the runbook §4 verifies.
//   - Confirms `getScenarios()` filtering returns the right subset.
//   - Verifies `scripts/graph-bench/run-benchmark.ts` still exports the
//     CLI entrypoint shape (mkdirSync + writeFileSync are still in use,
//     so a future refactor cannot accidentally drop the report writer).
//
// What this test does NOT do:
//   - Run any scenario. The scenarios reach real GraphRepository
//     methods which require ASDB + (for Neo4j) a live bolt connection.
//     Live execution is operator territory per the runbook.
//   - Connect to any database.
//
// Linked artifacts:
//   docs/runbooks/agent-studio-native-graph-workspace-neo4j-ce-benchmark-runbook.md
//   scripts/graph-bench/README.md

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import { SCENARIOS, getScenarios } from "../../../scripts/graph-bench/lib/scenarios.js";
import { DEFAULT_FIXTURE } from "../../../scripts/graph-bench/lib/fixtures.js";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const RUN_BENCHMARK_PATH = join(REPO_ROOT, "scripts", "graph-bench", "run-benchmark.ts");

// Pinned scenario keys — the canonical 10 listed in the runbook §6
// pass/fail table and in `scripts/graph-bench/README.md`. Changing this
// list requires updating both surfaces in the same PR.
const EXPECTED_SCENARIO_KEYS: ReadonlyArray<string> = [
  "note_open",
  "backlinks_refresh",
  "note_projection_to_neo4j",
  "local_graph_depth_2",
  "permission_aware_depth_3",
  "search_10k_notes",
  "graphrag_retrieval",
  "cypher_template",
  "runtime_trace_load",
  "entity_resolution_scan",
];

describe("graph-bench harness — static integrity", () => {
  describe("scenario library", () => {
    it("exports the canonical 10-scenario set", () => {
      expect(SCENARIOS).toHaveLength(EXPECTED_SCENARIO_KEYS.length);
      const keys = SCENARIOS.map((s) => s.key);
      expect(keys).toEqual(EXPECTED_SCENARIO_KEYS);
    });

    it("every scenario has a non-empty description", () => {
      for (const s of SCENARIOS) {
        expect(typeof s.description).toBe("string");
        expect(s.description.length).toBeGreaterThan(0);
      }
    });

    it("every scenario has positive p50 + p95 targets", () => {
      for (const s of SCENARIOS) {
        expect(s.targetP50Ms).toBeGreaterThan(0);
        expect(s.targetP95Ms).toBeGreaterThan(0);
      }
    });

    it("every scenario has p50 strictly less than p95", () => {
      // If p50 >= p95, the runbook's pass-criterion (`p50 <= target.p50
      // AND p95 <= target.p95`) becomes degenerate and effectively
      // checks only p95. A reversed pair would silently pass every
      // backend regardless of distribution.
      for (const s of SCENARIOS) {
        expect(
          s.targetP50Ms,
          `Scenario ${s.key} has p50=${s.targetP50Ms}ms >= p95=${s.targetP95Ms}ms — targets are reversed or equal.`,
        ).toBeLessThan(s.targetP95Ms);
      }
    });

    it("every scenario exposes a run(repo) function", () => {
      for (const s of SCENARIOS) {
        expect(typeof s.run).toBe("function");
      }
    });

    it("has no duplicate scenario keys", () => {
      const seen = new Set<string>();
      for (const s of SCENARIOS) {
        expect(seen.has(s.key)).toBe(false);
        seen.add(s.key);
      }
    });
  });

  describe("getScenarios filter", () => {
    it("returns the full set on undefined / empty / 'all'", () => {
      expect(getScenarios()).toHaveLength(SCENARIOS.length);
      expect(getScenarios([])).toHaveLength(SCENARIOS.length);
      expect(getScenarios(["all"])).toHaveLength(SCENARIOS.length);
    });

    it("filters to the requested subset", () => {
      const subset = getScenarios(["note_open", "search_10k_notes"]);
      expect(subset.map((s) => s.key)).toEqual([
        "note_open",
        "search_10k_notes",
      ]);
    });

    it("returns an empty array for an unknown key (caller-visible miss)", () => {
      // Unknown keys must produce a visible empty result so a typo
      // in the operator CLI fails loudly rather than silently
      // running zero iterations.
      expect(getScenarios(["does_not_exist"])).toHaveLength(0);
    });
  });

  describe("DEFAULT_FIXTURE", () => {
    it("pins the runbook-specified sizes (10k / 100k / 50k / 250k)", () => {
      expect(DEFAULT_FIXTURE.notes).toBe(10_000);
      expect(DEFAULT_FIXTURE.links).toBe(100_000);
      expect(DEFAULT_FIXTURE.nodes).toBe(50_000);
      expect(DEFAULT_FIXTURE.edges).toBe(250_000);
    });

    it("preserves the entity-node + mention-edge derivations", () => {
      // The fixture generator (lib/fixtures.ts) derives non-note nodes
      // as `nodes - notes` and mention edges as `edges - links`. Both
      // must be positive — otherwise the generator's for-loop runs 0
      // times and the Entity / MENTIONS surfaces stay empty,
      // corrupting the permission_aware_depth_3 + entity_resolution_scan
      // scenarios.
      expect(DEFAULT_FIXTURE.nodes - DEFAULT_FIXTURE.notes).toBeGreaterThan(0);
      expect(DEFAULT_FIXTURE.edges - DEFAULT_FIXTURE.links).toBeGreaterThan(0);
    });
  });

  describe("CLI entrypoint", () => {
    it("scripts/graph-bench/run-benchmark.ts exists", () => {
      expect(existsSync(RUN_BENCHMARK_PATH)).toBe(true);
    });

    it("imports getGraphRepository + scenarios + fixtures + runner + reporter", () => {
      // The CLI orchestrates all 5 surfaces. A future refactor that
      // drops one of these imports breaks the harness silently
      // (a degraded report still writes; operator may not notice).
      const src = readFileSync(RUN_BENCHMARK_PATH, "utf8");
      expect(src).toMatch(/getGraphRepository/);
      expect(src).toMatch(/getScenarios/);
      expect(src).toMatch(/generateFixture/);
      expect(src).toMatch(/runBenchmark/);
      expect(src).toMatch(/formatReport/);
    });

    it("calls process.exit with the report's overallPassed flag", () => {
      // The runbook §6 relies on the CLI exiting 0 on pass / 1 on
      // fail to gate the closure PR. A future refactor that drops
      // the exit-code wiring would let a failing benchmark silently
      // produce a "passing" closure PR.
      const src = readFileSync(RUN_BENCHMARK_PATH, "utf8");
      expect(src).toMatch(/process\.exit\(\s*report\.overallPassed\s*\?\s*0\s*:\s*1\s*\)/);
    });
  });
});
