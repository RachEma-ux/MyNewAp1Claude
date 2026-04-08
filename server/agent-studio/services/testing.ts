/**
 * AI Agent Studio — Testing Service
 *
 * Real assertion engine + batch test execution.
 *
 * For each case in a suite:
 *  1. The agent is "executed" via runSimulation against the case input
 *  2. The case's `assertions` array is evaluated against the simulation
 *     result; each failing assertion produces a failure message
 *  3. The result row stores actual output + per-assertion outcomes
 *
 * Supported assertion kinds (declared inline by the case author):
 *  - { kind: "verdict_eq",     value: "pass"|"warning"|"blocked" }
 *  - { kind: "no_blockers" }
 *  - { kind: "max_risk",       value: number }
 *  - { kind: "max_cost",       value: number }
 *  - { kind: "min_step_count", value: number }
 *  - { kind: "max_step_count", value: number }
 *  - { kind: "output_contains",value: string }
 *
 * Unknown kinds are recorded as "skipped" rather than failing — keeps the
 * engine forward-compatible with future assertion authoring.
 */

import * as repo from "../repository";
import { runSimulation, type SimulationResult } from "./simulation";

export type AssertionKind =
  | "verdict_eq"
  | "no_blockers"
  | "max_risk"
  | "max_cost"
  | "min_step_count"
  | "max_step_count"
  | "output_contains";

export interface Assertion {
  kind: AssertionKind | string;
  value?: unknown;
  description?: string;
}

export interface AssertionOutcome {
  kind: string;
  ok: boolean;
  message?: string;
}

export interface TestRunResult {
  runId: number;
  status: "completed" | "failed";
  verdict: "pass" | "fail";
  passedCount: number;
  failedCount: number;
  results: Array<{
    caseId: number;
    verdict: "pass" | "fail" | "skipped" | "error";
    failureMessage?: string;
    durationMs: number;
    assertions: AssertionOutcome[];
  }>;
}

/**
 * Evaluate one assertion against a simulation result. Returns
 * `{ok, message}` — `ok=false` means the assertion failed.
 */
export function evaluateAssertion(
  assertion: Assertion,
  sim: SimulationResult
): AssertionOutcome {
  switch (assertion.kind) {
    case "verdict_eq": {
      const expected = String(assertion.value ?? "pass");
      const ok = sim.verdict === expected;
      return {
        kind: "verdict_eq",
        ok,
        message: ok ? undefined : `expected verdict=${expected}, got ${sim.verdict}`,
      };
    }
    case "no_blockers": {
      const blockedSteps = sim.steps.filter((s) => s.verdict === "blocked").length;
      const ok = blockedSteps === 0;
      return {
        kind: "no_blockers",
        ok,
        message: ok ? undefined : `${blockedSteps} blocked step(s) in timeline`,
      };
    }
    case "max_risk": {
      const limit = Number(assertion.value ?? 100);
      const ok = sim.riskScore <= limit;
      return {
        kind: "max_risk",
        ok,
        message: ok ? undefined : `risk ${sim.riskScore} > ${limit}`,
      };
    }
    case "max_cost": {
      const limit = Number(assertion.value ?? Infinity);
      const ok = sim.costEstimate <= limit;
      return {
        kind: "max_cost",
        ok,
        message: ok ? undefined : `cost ${sim.costEstimate} > ${limit}`,
      };
    }
    case "min_step_count": {
      const min = Number(assertion.value ?? 0);
      const ok = sim.steps.length >= min;
      return {
        kind: "min_step_count",
        ok,
        message: ok ? undefined : `step count ${sim.steps.length} < ${min}`,
      };
    }
    case "max_step_count": {
      const max = Number(assertion.value ?? Infinity);
      const ok = sim.steps.length <= max;
      return {
        kind: "max_step_count",
        ok,
        message: ok ? undefined : `step count ${sim.steps.length} > ${max}`,
      };
    }
    case "output_contains": {
      const needle = String(assertion.value ?? "");
      const haystack = JSON.stringify(sim.output) + JSON.stringify(sim.steps);
      const ok = haystack.includes(needle);
      return {
        kind: "output_contains",
        ok,
        message: ok ? undefined : `output does not contain "${needle}"`,
      };
    }
    default:
      // Unknown kinds don't fail — they're recorded as skipped
      return {
        kind: String(assertion.kind),
        ok: true,
        message: `(skipped — unknown assertion kind)`,
      };
  }
}

export async function runTestSuite(input: {
  suiteId: number;
  triggeredBy?: number;
}): Promise<TestRunResult> {
  const suite = await repo.getTestSuite(input.suiteId);
  if (!suite) throw new Error(`Test suite ${input.suiteId} not found`);
  const cases = await repo.listTestCases(input.suiteId);

  const run = await repo.createTestRun({
    suiteId: input.suiteId,
    agentId: suite.agentId,
    triggeredBy: input.triggeredBy,
  });
  await repo.updateTestRun(run.id, { status: "running" });

  const results: TestRunResult["results"] = [];
  let passed = 0;
  let failed = 0;

  for (const c of cases) {
    const start = Date.now();
    try {
      const sim = await runSimulation({
        agentId: suite.agentId,
        inputPayload: c.inputPayload as Record<string, unknown>,
        toggles: { mockedTools: true, sandboxMemory: true, strictPolicy: true },
      });

      // Evaluate each assertion. If the case has none, default to a single
      // implicit "verdict not blocked" assertion so the legacy behavior
      // (any non-blocked sim = pass) still works.
      const rawAssertions =
        Array.isArray(c.assertions) && c.assertions.length > 0
          ? (c.assertions as Assertion[])
          : ([{ kind: "no_blockers" }] as Assertion[]);

      const outcomes = rawAssertions.map((a) => evaluateAssertion(a, sim));
      const failedOutcomes = outcomes.filter((o) => !o.ok);
      const verdict: "pass" | "fail" = failedOutcomes.length === 0 ? "pass" : "fail";

      const durationMs = Date.now() - start;
      const failureMessage =
        verdict === "fail"
          ? failedOutcomes
              .map((o) => `[${o.kind}] ${o.message ?? "failed"}`)
              .join("; ")
          : undefined;

      await repo.recordTestResult({
        runId: run.id,
        caseId: c.id,
        verdict,
        actual: {
          simulationRunId: sim.runId,
          simVerdict: sim.verdict,
          riskScore: sim.riskScore,
          costEstimate: sim.costEstimate,
          stepCount: sim.steps.length,
          assertions: outcomes,
        },
        failureMessage,
        durationMs,
      });
      results.push({
        caseId: c.id,
        verdict,
        failureMessage,
        durationMs,
        assertions: outcomes,
      });
      if (verdict === "pass") passed++;
      else failed++;
    } catch (err: any) {
      const durationMs = Date.now() - start;
      await repo.recordTestResult({
        runId: run.id,
        caseId: c.id,
        verdict: "error",
        failureMessage: err?.message ?? "Unknown error",
        durationMs,
      });
      results.push({
        caseId: c.id,
        verdict: "error",
        failureMessage: err?.message,
        durationMs,
        assertions: [],
      });
      failed++;
    }
  }

  const overallVerdict: "pass" | "fail" = failed === 0 ? "pass" : "fail";
  await repo.updateTestRun(run.id, {
    status: "completed",
    verdict: overallVerdict,
    passedCount: passed,
    failedCount: failed,
    finishedAt: new Date(),
  });

  return {
    runId: run.id,
    status: "completed",
    verdict: overallVerdict,
    passedCount: passed,
    failedCount: failed,
    results,
  };
}
