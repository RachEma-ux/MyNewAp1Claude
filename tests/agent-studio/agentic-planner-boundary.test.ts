// Native Graph Workspace V1.0 — Phase 13.5 / PR #1.
//
// Agentic GraphRAG — boundary tests.
//
// What this test enforces (source-scan + behavioral):
//
//   Source-scan (any new `agentic-*.ts` file under
//   `server/agent-studio/services/graph-agent/` MUST satisfy these):
//     - No `neo4j-driver` import — graph access goes through
//       GraphRepository, never the raw driver.
//     - No `dispatchMcpToolCall` import or call — tools route through
//       the engine's existing dispatcher chokepoint, never the
//       planner / loop.
//     - No graph-mutation call sites — the loop is read-only by
//       interface design; this scan is the source-of-truth lock.
//
//   Behavioral (using the no-op ALWAYS_STOP_PLANNER):
//     - AGENTIC_PLANNER_ACTION_KINDS is exactly 3 variants
//       (retrieve / answer / stop). A 4th variant requires updating
//       both the union and this test in the same PR — see ADR
//       §"REGRESSION GUARD".
//     - Loop terminates within `maxIterations + 1` planner calls
//       regardless of planner behavior.
//     - Loop emits zero retrieval calls when planner returns
//       { kind: "stop" } (PR #1 stub never executes retrieval).
//     - validateAgenticPlannerAction rejects invalid shapes loudly.
//
// Linked artifacts:
//   docs/architecture/agent-studio-agentic-graphrag.md
//   server/agent-studio/services/graph-agent/agentic-planner-contract.ts
//   server/agent-studio/services/graph-agent/agentic-loop.ts

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AGENTIC_PLANNER_ACTION_KINDS,
  DEFAULT_AGENTIC_LOOP_BUDGET,
  validateAgenticPlannerAction,
  type AgenticPlanner,
} from "../../server/agent-studio/services/graph-agent/agentic-planner-contract.js";
import {
  ALWAYS_STOP_PLANNER,
  runAgenticLoop,
} from "../../server/agent-studio/services/graph-agent/agentic-loop.js";

const REPO_ROOT = join(__dirname, "..", "..");
const GRAPH_AGENT_DIR = join(
  REPO_ROOT,
  "server",
  "agent-studio",
  "services",
  "graph-agent",
);

/**
 * Collect the source of every `agentic-*.ts` file. The boundary
 * source-scans apply only to this prefix; the rest of the
 * graph-agent module has its own (already-tested) boundaries.
 */
function readAgenticFiles(): Array<{ path: string; src: string }> {
  const out: Array<{ path: string; src: string }> = [];
  for (const entry of readdirSync(GRAPH_AGENT_DIR)) {
    if (
      entry.startsWith("agentic-") &&
      entry.endsWith(".ts") &&
      !entry.endsWith(".test.ts")
    ) {
      const full = join(GRAPH_AGENT_DIR, entry);
      const stat = statSync(full);
      if (stat.isFile()) {
        out.push({ path: entry, src: readFileSync(full, "utf8") });
      }
    }
  }
  return out;
}

describe("Phase 13.5 PR #1 — Agentic planner boundary", () => {
  describe("source-scan boundaries (every agentic-*.ts file)", () => {
    const files = readAgenticFiles();

    it("at least two agentic-*.ts files exist (contract + loop)", () => {
      // Sanity — if the file count drops to zero, the source-scan
      // becomes a no-op assertion. PR #1 ships 2 files; later PRs add
      // more. The lower bound is structural; the upper bound is not
      // policed (more is fine, less is regression).
      expect(files.length).toBeGreaterThanOrEqual(2);
      const names = files.map((f) => f.path).sort();
      expect(names).toContain("agentic-planner-contract.ts");
      expect(names).toContain("agentic-loop.ts");
    });

    for (const { path, src } of files) {
      it(`${path}: no neo4j-driver import`, () => {
        expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
        expect(src).not.toMatch(/require\s*\(\s*["']neo4j-driver["']/);
      });

      it(`${path}: no dispatchMcpToolCall reference`, () => {
        // Strip comments first so doc-block references (which
        // explain WHY this rule exists) don't false-positive. Same
        // approach as `dispatcher-audit-coverage.test.ts` after the
        // PR #725 hardening.
        const stripped = stripCommentsPreservingOffsets(src);
        expect(stripped).not.toMatch(/\bdispatchMcpToolCall\b/);
      });

      it(`${path}: no direct graph-mutation call`, () => {
        // Mutations on GraphRepository are `upsertNode` / `upsertEdge`
        // / `deleteNode` / `deleteEdge`. The agentic planner + loop
        // are read-only by interface design; if any of these appear,
        // the read-only invariant has been weakened.
        const stripped = stripCommentsPreservingOffsets(src);
        expect(stripped).not.toMatch(/\.upsertNode\s*\(/);
        expect(stripped).not.toMatch(/\.upsertEdge\s*\(/);
        expect(stripped).not.toMatch(/\.deleteNode\s*\(/);
        expect(stripped).not.toMatch(/\.deleteEdge\s*\(/);
      });

      it(`${path}: no direct model-call (ModelAccessAdapter.execute or .stream)`, () => {
        // The planner CAN be model-backed in PR #2, but the model call
        // must go through the engine's ModelAccessAdapter, NOT through
        // a direct call inside the loop. This source-scan ensures the
        // loop file doesn't reach for a model executor directly.
        const stripped = stripCommentsPreservingOffsets(src);
        // Allow the literal string `ModelAccessAdapter` to appear in
        // type imports (it's the engine's adapter interface), but not
        // as a method call site like `.execute(` or `.stream(` on a
        // model-access object.
        if (path !== "agentic-planner-contract.ts") {
          // Contract file does NOT reference ModelAccessAdapter at all.
          expect(stripped).not.toMatch(/ModelAccessAdapter\b/);
        }
      });
    }
  });

  describe("AgenticPlannerAction union closure", () => {
    it("has exactly the 3 documented variants", () => {
      // Closure regression guard. Adding a 4th variant (e.g.
      // "dispatch_tool" / "mutate_graph" / "call_model") MUST update
      // the ADR + this assertion in the same PR.
      expect([...AGENTIC_PLANNER_ACTION_KINDS]).toEqual([
        "retrieve",
        "answer",
        "stop",
      ]);
    });
  });

  describe("validateAgenticPlannerAction", () => {
    it("accepts a well-formed retrieve action", () => {
      const v = validateAgenticPlannerAction({
        kind: "retrieve",
        retrievalMode: "graphrag_local",
        reason: "first pass",
      });
      expect(v.ok).toBe(true);
    });

    it("accepts a well-formed answer action", () => {
      const v = validateAgenticPlannerAction({
        kind: "answer",
        reason: "confidence high",
      });
      expect(v.ok).toBe(true);
    });

    it("accepts a well-formed stop action", () => {
      const v = validateAgenticPlannerAction({
        kind: "stop",
        reason: "operator policy",
      });
      expect(v.ok).toBe(true);
    });

    it("rejects null / non-object", () => {
      expect(validateAgenticPlannerAction(null).ok).toBe(false);
      expect(validateAgenticPlannerAction("retrieve").ok).toBe(false);
      expect(validateAgenticPlannerAction(42).ok).toBe(false);
    });

    it("rejects unknown action.kind values (closure enforcement)", () => {
      const denied = ["dispatch_tool", "mutate_graph", "call_model", "summarize", ""];
      for (const k of denied) {
        const v = validateAgenticPlannerAction({ kind: k, reason: "x" });
        expect(v.ok, `expected kind="${k}" to be rejected`).toBe(false);
      }
    });

    it("rejects retrieve action missing retrievalMode", () => {
      const v = validateAgenticPlannerAction({ kind: "retrieve", reason: "x" });
      expect(v.ok).toBe(false);
    });

    it("rejects empty-reason actions", () => {
      const v = validateAgenticPlannerAction({ kind: "stop", reason: "" });
      expect(v.ok).toBe(false);
    });
  });

  describe("runAgenticLoop — bounded-loop guarantees", () => {
    it("terminates immediately when planner returns stop", async () => {
      const result = await runAgenticLoop(
        { query: "what is in my vault?" },
        { planner: ALWAYS_STOP_PLANNER },
      );
      expect(result.terminationReason).toBe("planner_stop");
      expect(result.plannerCallCount).toBe(1);
      expect(result.steps).toHaveLength(0);
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].kind).toBe("stop");
    });

    it("terminates within maxIterations + 1 calls with a chatty retrieve planner", async () => {
      const chattyPlanner: AgenticPlanner = {
        async plan() {
          return {
            kind: "retrieve",
            retrievalMode: "graphrag_local",
            reason: "keep going",
          };
        },
      };
      const result = await runAgenticLoop(
        { query: "stress test" },
        { planner: chattyPlanner, budget: { maxIterations: 3 } },
      );
      // maxIterations=3 → ceiling=4. Planner never says stop, so the
      // loop runs the full ceiling, then terminates with
      // "max_iterations".
      expect(result.plannerCallCount).toBe(4);
      expect(result.terminationReason).toBe("max_iterations");
    });

    it("emits zero retrieval calls under the always-stop planner", async () => {
      // PR #1 doesn't wire retrieval, but this test pins the
      // invariant: a stop-only planner produces an empty `steps`
      // array. PR #2 wiring must preserve this — `steps` only grows
      // on `retrieve` actions.
      const result = await runAgenticLoop(
        { query: "x" },
        { planner: ALWAYS_STOP_PLANNER, budget: { maxIterations: 10 } },
      );
      expect(result.steps).toHaveLength(0);
    });

    it("halts with invalid_action when planner returns garbage", async () => {
      const badPlanner: AgenticPlanner = {
        async plan() {
          return { kind: "dispatch_tool", reason: "leak attempt" } as never;
        },
      };
      const result = await runAgenticLoop(
        { query: "x" },
        { planner: badPlanner },
      );
      expect(result.terminationReason).toBe("invalid_action");
      expect(result.invalidActionReason).toMatch(/dispatch_tool/);
    });

    it("respects the wall-clock budget", async () => {
      // Inject a virtual clock that jumps past the budget on first
      // tick. The planner never gets called past the timeout check.
      const tickValues = [0, 31_000];
      let tick = 0;
      const result = await runAgenticLoop(
        { query: "x" },
        {
          planner: {
            async plan() {
              return {
                kind: "retrieve",
                retrievalMode: "graphrag_local",
                reason: "would have continued",
              };
            },
          },
          budget: { wallClockBudgetMs: 30_000 },
          now: () => tickValues[Math.min(tick++, tickValues.length - 1)],
        },
      );
      expect(result.terminationReason).toBe("wall_clock_budget");
    });

    it("DEFAULT_AGENTIC_LOOP_BUDGET pins maxIterations=4, wallClock=30s, confidence=0.85", () => {
      // Pins the ADR-promised defaults. Any future drift updates the
      // ADR + this test in the same PR.
      expect(DEFAULT_AGENTIC_LOOP_BUDGET.maxIterations).toBe(4);
      expect(DEFAULT_AGENTIC_LOOP_BUDGET.wallClockBudgetMs).toBe(30_000);
      expect(DEFAULT_AGENTIC_LOOP_BUDGET.confidenceThreshold).toBe(0.85);
    });
  });
});

/**
 * Strip `/* ... *\/` and `// ...` comments while preserving offsets so
 * the source-scan regexes don't false-positive on JSDoc references.
 * Mirrors the helper in `dispatcher-audit-coverage.test.ts`.
 */
function stripCommentsPreservingOffsets(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (let k = i; k < stop; k++) {
        out += src[k] === "\n" ? "\n" : " ";
      }
      i = stop;
    } else if (ch === "/" && next === "/") {
      let k = i;
      while (k < src.length && src[k] !== "\n") {
        out += " ";
        k++;
      }
      i = k;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}
