/**
 * Phase 22 §T-I.51 — RAC retrieval executor timeout → bridge.
 *
 * Source-scan structural test asserting `retrieval-executor.ts` emits
 * `graph_query_timeout` when one or more sources in the parallel
 * `runItem` fan-out time out. One event per executor call (NOT per
 * timed-out source) to avoid drowning the dashboard when an entire
 * plan times out simultaneously; `timedOutSourceIds` metadata carries
 * the per-source breakdown.
 *
 * Closes the first of two "🟡 detection state exists in DB but no
 * observability surface" detection-gap items from the audit doc
 * (#10 `graph_query_timeout`). The detection itself already lived at
 * `runWithTimeout` → `errorReason: "timeout"` on the `runItem` catch
 * branch; this slice is the emission side only.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const executorPath = resolve(
  __dirname,
  "../../server/agent-studio/services/rac/retrieval-executor.ts",
);

describe("RAC retrieval executor is wired into the bridge", () => {
  const src = readFileSync(executorPath, "utf8");

  it("imports recordFailureStateEvent from the bridge", () => {
    expect(src).toMatch(
      /import\s*\{\s*recordFailureStateEvent\s*\}\s*from\s*["'][^"']*failure-states\/observability-bridge/,
    );
  });

  it("uses the closed graph_query_timeout kind", () => {
    expect(src).toContain('failureState: "graph_query_timeout"');
  });

  it("emits only when at least one source timed out (gate on length > 0)", () => {
    // The gate `timedOutSources.length > 0` short-circuits the
    // emission for the happy path. Without this, every executor call
    // would emit even when all sources succeeded.
    expect(src).toMatch(
      /timedOutSources\s*=\s*perSource\.filter\([\s\S]{0,200}errorReason\s*===\s*"timeout"[\s\S]{0,300}timedOutSources\.length\s*>\s*0[\s\S]{0,200}recordFailureStateEvent/,
    );
  });

  it("metadata carries timeoutMs / timedOutCount / totalSourceCount / timedOutSourceIds / totalLatencyMs", () => {
    expect(src).toContain("timeoutMs,");
    expect(src).toContain("timedOutCount: timedOutSources.length");
    expect(src).toContain("totalSourceCount: perSource.length");
    expect(src).toContain("timedOutSourceIds: timedOutSources.map(");
    expect(src).toContain("totalLatencyMs,");
  });

  it("sourceKind names the executor", () => {
    expect(src).toContain('sourceKind: "rac-retrieval-executor"');
  });

  it("sourceId stringifies the optional runtimeRunId (null when absent)", () => {
    expect(src).toMatch(
      /sourceId:\s*\n?\s*input\.runtimeRunId\s*!==\s*undefined\s*\?\s*String\(input\.runtimeRunId\)\s*:\s*null/,
    );
  });

  it("errorMessage includes timed-out count, total, and timeoutMs", () => {
    expect(src).toContain(
      "${timedOutSources.length} of ${perSource.length} sources timed out (timeoutMs=${timeoutMs})",
    );
  });

  it("fire-and-forget — void + .catch envelope", () => {
    expect(src).toMatch(/void recordFailureStateEvent[\s\S]{0,1500}\.catch/);
  });

  it("exactly one recordFailureStateEvent call site in this file", () => {
    const calls = src.match(/recordFailureStateEvent\(/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  it("emission happens after Promise.all but before return — totalLatencyMs is captured once and reused", () => {
    // The slice extracts `totalLatencyMs = Date.now() - start` so
    // both the metadata stamp and the return value see the same
    // value. Tests pin this so a future refactor doesn't drift to
    // measuring twice (which would surface as a metadata vs return
    // value mismatch).
    const totalLatencyDecls = src.match(/const totalLatencyMs = Date\.now\(\) - start/g) ?? [];
    expect(totalLatencyDecls).toHaveLength(1);
  });
});
