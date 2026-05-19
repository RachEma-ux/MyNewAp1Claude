/**
 * Cycle-8 doc-debt sweep — source-scan test.
 *
 * Slice 36 of the no-deferral continuation-2 catalogue (2026-05-19).
 * Asserts the closed-by-successor cycle-8 markers identified in the
 * post-slice-32 re-audit have been rewritten to status-neutral
 * language. Each assertion pairs the rewritten target with the
 * successor code that closed the marker so accidentally
 * reintroducing the stale language during a future refactor trips
 * the test.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("no-deferral slice 36 — cycle-8 doc-debt sweep", () => {
  it("rac-orchestrator.ts no longer claims M7-c8 registry is deferred", () => {
    const src = read(
      "server/agent-studio/services/runtime/rac-orchestrator.ts",
    );
    expect(src).not.toContain(
      "M7-c8 (registry pattern for orchestration errors, deferred to",
    );
    // Successor must exist + be named.
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "server/agent-studio/services/runtime/orchestration-error.ts",
        ),
      ),
    ).toBe(true);
    expect(src).toContain("services/runtime/orchestration-error.ts");
    expect(src).toContain("typed `OrchestrationErrorCode` union");
  });

  it("rac-orchestrator.ts L4-c8 lockstep test invariants still hold", () => {
    // The l1-l4-c8-doc-bundle.test.ts asserts the doc-block names
    // L4-c8 + DispatchErrorCode + the namespace-boundary contract.
    // Re-assert here so slice 36's rewrite doesn't accidentally
    // weaken the lockstep guard.
    const src = read(
      "server/agent-studio/services/runtime/rac-orchestrator.ts",
    );
    expect(src).toMatch(/L4-c8/);
    expect(src).toMatch(/DispatchErrorCode/);
    expect(src).toMatch(/namespaces are NOT mergeable/);
  });

  it("planner-mode.ts file-header no longer claims derivation extension is deferred", () => {
    const src = read("server/agent-studio/services/rac/planner-mode.ts");
    expect(src).not.toContain(
      "Derivation extension is deferred",
    );
    expect(src).not.toContain(
      "derivation extension deferred until per-source retrieval-method metadata lands",
    );
    // Successor — readGraphragRetrievalMethod is the discriminator
    // function that activates the 7 GraphRAG modes.
    expect(src).toContain("readGraphragRetrievalMethod");
    // The 7 GraphRAG mode literals are emitted from derivePlannerMode's
    // GraphRAG branch (verifies the closure claim).
    expect(src).toMatch(/`graphrag_\$\{chosenMethod\}` as RacPlannerMode/);
  });

  it("planner-mode.ts inline RAC_PLANNER_MODES comment is rewritten", () => {
    const src = read("server/agent-studio/services/rac/planner-mode.ts");
    expect(src).not.toContain(
      "Type-level only today; derivation extension deferred until per-source",
    );
    expect(src).toContain(
      "Emitted by `derivePlannerMode` when a runnable source carries",
    );
  });

  it("PHASE_12_RESERVED_MODES doc-block names the discriminator-gated emission", () => {
    const src = read("server/agent-studio/services/rac/planner-mode.ts");
    expect(src).not.toContain(
      "Reserved Phase 12 modes that the current `derivePlannerMode`\n * implementation never emits.",
    );
    expect(src).toContain(
      "`derivePlannerMode` emits these only when",
    );
    expect(src).toContain(
      "the lockstep\n * test asserts that absence",
    );
  });
});
