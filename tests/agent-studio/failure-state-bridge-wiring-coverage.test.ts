/**
 * Phase 22 §T-I.6 — Bridge wiring coverage guard.
 *
 * Lockstep guard for the failure-state observability bridge (#1013).
 * Asserts that the bridge has the expected live wiring callsites
 * across the codebase, AND that each wiring imports the bridge from
 * the canonical path. A future refactor that silently removes a
 * wiring will trip this test.
 *
 * Maintenance:
 *   - When a new closed kind is wired, add a row to
 *     `EXPECTED_WIRINGS` below.
 *   - When a wiring is intentionally removed (the underlying surface
 *     deleted, e.g.), update or remove its row in the same PR.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { FAILURE_STATES } from "../../server/agent-studio/services/failure-states/contracts";

interface ExpectedWiring {
  /** Path relative to repo root. */
  readonly file: string;
  /** Closed-taxonomy kind the file emits. */
  readonly kind: (typeof FAILURE_STATES)[number];
  /** Slice ID for traceability back to the PR description. */
  readonly sliceId: string;
}

const EXPECTED_WIRINGS: ReadonlyArray<ExpectedWiring> = [
  {
    file: "server/agent-studio/services/graph/health-alert.ts",
    kind: "neo4j_unavailable",
    sliceId: "T-I.5.A.1",
  },
  {
    file: "server/agent-studio/services/graph/health-alert.ts",
    kind: "neo4j_degraded",
    sliceId: "T-I.5.A.1",
  },
  {
    file: "server/agent-studio/services/graph/projection/drift-cron.ts",
    kind: "neo4j_projection_drift_detected",
    sliceId: "T-I.5.A.2",
  },
  {
    file: "server/agent-studio/services/graph/retrieval/retrieval-router.ts",
    kind: "retrieval_safety_filter_blocked_content",
    sliceId: "T-I.5.A.3",
  },
  {
    file: "server/agent-studio/services/mcp/auto-sync.ts",
    kind: "tool_schema_changed",
    sliceId: "T-I.5.A.4",
  },
  {
    file: "server/agent-studio/services/graph/retrieval/retrieval-router.ts",
    kind: "text2cypher_rejected",
    sliceId: "T-I.5.A.5",
  },
  {
    file: "server/agent-studio/services/graph/retrieval/retrieval-router.ts",
    kind: "cypher_query_template_failed",
    sliceId: "T-I.5.A.6",
  },
  {
    file: "server/agent-studio/services/graph-agent/engine.ts",
    kind: "graph_agent_answer_incomplete",
    sliceId: "T-I.5.B.1",
  },
  {
    file: "server/agent-studio/services/graph/projection/sync-worker.ts",
    kind: "projection_sync_failed",
    sliceId: "T-I.5.B.2",
  },
  {
    file: "server/agent-studio/services/graph-quality/agent-run.ts",
    kind: "entity_resolution_conflict",
    sliceId: "T-I.5.B.3",
  },
  {
    file: "server/agent-studio/services/promotion/lifecycle.ts",
    kind: "promotion_failed",
    sliceId: "T-I.5.B.4",
  },
];

function readRepoFile(file: string): string {
  return readFileSync(resolve(__dirname, "../..", file), "utf8");
}

describe("Failure-state bridge wiring coverage", () => {
  it("expected-wirings table covers batch A (≥6) + batch B in progress", () => {
    expect(EXPECTED_WIRINGS.length).toBeGreaterThanOrEqual(10);
  });

  it("every expected closed kind appears in FAILURE_STATES", () => {
    const allKinds = new Set<string>(FAILURE_STATES);
    for (const w of EXPECTED_WIRINGS) {
      expect(allKinds.has(w.kind)).toBe(true);
    }
  });

  it.each(EXPECTED_WIRINGS)(
    "$file references the closed kind \"$kind\" (slice $sliceId)",
    ({ file, kind }) => {
      const src = readRepoFile(file);
      // Either a literal `failureState: "<kind>"` in the emit site,
      // or a string-literal reference in a mapping helper (e.g. the
      // health-alert key→failure-state mapper that returns the kind
      // by value rather than as a property literal).
      const inEmit = src.includes(`failureState: "${kind}"`);
      const asLiteral = src.includes(`"${kind}"`);
      expect(inEmit || asLiteral).toBe(true);
    },
  );

  it.each(
    Array.from(new Set(EXPECTED_WIRINGS.map((w) => w.file))).map((file) => ({
      file,
    })),
  )("$file imports recordFailureStateEvent from the canonical path", ({ file }) => {
    const src = readRepoFile(file);
    expect(src).toMatch(
      /import[\s\S]{0,80}recordFailureStateEvent[\s\S]{0,80}from\s*["'][^"']*failure-states\/observability-bridge/,
    );
  });

  it.each(EXPECTED_WIRINGS)(
    "$file uses fire-and-forget envelope for $kind",
    ({ file }) => {
      const src = readRepoFile(file);
      // `void recordFailureStateEvent(...).catch(...)` is the canonical
      // envelope. We assert at least one such envelope exists in each
      // file.
      expect(src).toMatch(
        /void recordFailureStateEvent[\s\S]{0,1500}\.catch/,
      );
    },
  );

  it("at least 10 distinct closed kinds are wired (batch A + batch B in progress)", () => {
    const distinctKinds = new Set(EXPECTED_WIRINGS.map((w) => w.kind));
    expect(distinctKinds.size).toBeGreaterThanOrEqual(10);
  });
});
