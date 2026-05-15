/**
 * Phase 22 §T-I.5 batch B.2 — Projection sync failure → bridge.
 *
 * Source-scan structural test asserting the sync worker emits
 * `projection_sync_failed` when its apply step reports ≥1 error.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const workerPath = resolve(
  __dirname,
  "../../server/agent-studio/services/graph/projection/sync-worker.ts",
);

describe("projection sync-worker is wired into the bridge", () => {
  const src = readFileSync(workerPath, "utf8");

  it("imports recordFailureStateEvent from the bridge", () => {
    expect(src).toMatch(
      /import\s*\{\s*recordFailureStateEvent\s*\}\s*from\s*["'][^"']*failure-states\/observability-bridge/,
    );
  });

  it("uses the closed projection_sync_failed kind", () => {
    expect(src).toContain('failureState: "projection_sync_failed"');
  });

  it("emits only when status === 'failed' (partial-success counts as failed)", () => {
    expect(src).toMatch(
      /status\s*===\s*"failed"[\s\S]{0,400}recordFailureStateEvent/,
    );
  });

  it("metadata carries eventKind + errorCount + firstError + writes + durationMs", () => {
    expect(src).toContain("eventKind: event.kind");
    expect(src).toContain("errorCount: result.errors.length");
    expect(src).toContain("firstError: result.errors[0]?.error ?? null");
    expect(src).toMatch(/writes:[\s\S]{0,200}result\.nodesCreated/);
    expect(src).toMatch(/durationMs: Date\.now\(\) - startedAt/);
  });

  it("fire-and-forget — void + .catch envelope", () => {
    expect(src).toMatch(
      /void recordFailureStateEvent[\s\S]{0,800}\.catch/,
    );
  });
});
