/**
 * Code Graph Parser Spike — T-E.3 performance measurement.
 *
 * Runs T-E.2's `aggregate()` against the §2 sample-ingest target
 * (`server/agent-studio/services/extensions/`) and asserts the §4
 * performance gates:
 *
 *   - Per-file parse time p95 < 50 ms
 *   - Total parse time < 5000 ms (for ~15 files)
 *
 * The actual numbers are logged to stdout so they appear in CI
 * output. The decision-recorded doc at
 * `docs/implementation/agent-studio-code-graph-parser-spike-measurement-2026-05-17.md`
 * names this test as the canonical evidence locator — after CI
 * runs, the operator copies the numbers from the CI log into the
 * "Recorded results" table in that doc.
 *
 * The projection-time and Neo4j-CE-query-latency gates from §4 are
 * deferred to T-E.4 because they require Neo4j CE running (not in
 * CI's service containers today). The parse-time half is the
 * gating half: if parsing already fails the gate, projection +
 * query won't recover the spike.
 *
 * On-device caveat: this test requires `tree-sitter` +
 * `tree-sitter-typescript` to be installed (added in T-E.2 / #1363).
 * Native deps on Termux are not feasible, so this test only runs
 * in CI. Local skip is via the existing per-environment test
 * filtering — no skip-gate needed in the test body.
 *
 * Spike-fail signal: if either assertion fails, the spike has
 * answered §0's question with "no" — the operator updates the
 * decision-recorded doc with the failing numbers + the §4
 * fall-back option (restrict-to-TypeScript-only OR trigger-Phase-27)
 * and ships T-E.4 as a "spike-failed addendum + Phase 25 scope
 * reduction" PR per the doc §6 sequencing.
 */

import { describe, expect, it } from "vitest";

import {
  aggregate,
  REPO_ROOT,
  SPIKE_TARGET_DIR,
} from "../../server/agent-studio/services/code-graph/spike/run-sample-ingest.js";

/**
 * §4 parse-time targets. Hard-coded so any future relaxation
 * requires an explicit doc + test edit (and corresponding update
 * to the spike doc §4 numbers).
 */
const TARGET_P95_PER_FILE_MS = 50;
const TARGET_TOTAL_PARSE_MS = 5000;

function quantile(sortedMs: readonly number[], q: number): number {
  if (sortedMs.length === 0) return 0;
  const idx = Math.min(
    sortedMs.length - 1,
    Math.floor((sortedMs.length - 1) * q),
  );
  return sortedMs[idx];
}

describe("T-E.3 — Code Graph Parser Spike performance measurement", () => {
  it("aggregate() runs against services/extensions/ and reports >0 files parsed", () => {
    const agg = aggregate(REPO_ROOT, SPIKE_TARGET_DIR);
    console.log(
      `[T-E.3] files parsed: ${agg.files} (target dir: ${SPIKE_TARGET_DIR})`,
    );
    expect(agg.files).toBeGreaterThan(0);
  });

  it("per-file parse time p95 < 50 ms (spike doc §4 gate)", () => {
    const agg = aggregate(REPO_ROOT, SPIKE_TARGET_DIR);
    const sortedMs = [...agg.timings.map((t) => t.parseMs)].sort(
      (a, b) => a - b,
    );
    const p50 = quantile(sortedMs, 0.5);
    const p95 = quantile(sortedMs, 0.95);
    const max = sortedMs[sortedMs.length - 1] ?? 0;
    console.log(
      `[T-E.3] parse-time per file (ms): p50=${p50.toFixed(2)} p95=${p95.toFixed(2)} max=${max.toFixed(2)} target_p95<${TARGET_P95_PER_FILE_MS}`,
    );
    expect(p95).toBeLessThan(TARGET_P95_PER_FILE_MS);
  });

  it("total parse time < 5000 ms for the spike target (spike doc §4 gate)", () => {
    const agg = aggregate(REPO_ROOT, SPIKE_TARGET_DIR);
    console.log(
      `[T-E.3] total parse time (ms): ${agg.totalParseMs.toFixed(2)} for ${agg.files} files target<${TARGET_TOTAL_PARSE_MS}`,
    );
    expect(agg.totalParseMs).toBeLessThan(TARGET_TOTAL_PARSE_MS);
  });

  it("emits the strict-subset node/edge model per spike doc §3 (cross-check by-type counts)", () => {
    const agg = aggregate(REPO_ROOT, SPIKE_TARGET_DIR);
    const nodeByType = new Map<string, number>();
    for (const n of agg.nodes) {
      nodeByType.set(n.type, (nodeByType.get(n.type) ?? 0) + 1);
    }
    const edgeByType = new Map<string, number>();
    for (const e of agg.edges) {
      edgeByType.set(e.type, (edgeByType.get(e.type) ?? 0) + 1);
    }
    console.log(
      `[T-E.3] nodes by type: ${[...nodeByType].map(([t, c]) => `${t}=${c}`).join(" ")}`,
    );
    console.log(
      `[T-E.3] edges by type: ${[...edgeByType].map(([t, c]) => `${t}=${c}`).join(" ")}`,
    );
    // At minimum the File node count == files-parsed count, and
    // there must be at least one DECLARES edge somewhere — extensions/
    // has classes + functions per its known shape.
    expect(nodeByType.get("File") ?? 0).toBe(agg.files);
    expect(edgeByType.get("DECLARES") ?? 0).toBeGreaterThan(0);
    expect(edgeByType.get("IMPORTS") ?? 0).toBeGreaterThan(0);
  });
});
