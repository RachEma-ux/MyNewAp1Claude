/**
 * T-I.59 — operator surface for closed-taxonomy emission rows.
 *
 * Source-scan asserts the new `agentStudio.workspaceObservability.
 * listRecentFailureStateEvents` admin tRPC procedure wraps the existing
 * `listErrorEvents` with a prebaked `errorClass IN` filter over the 25
 * `failure_state:<kind>` values from the closed taxonomy, and returns
 * both the raw rows AND the `summarizeFailureStateEventList`-shaped
 * summary so the operator dashboard can render counts-by-kind without
 * re-aggregating client-side.
 *
 * Sibling to the bridge wiring coverage guard (T-I.52) — that test
 * pins the *emission* surface; this one pins the *operator-read*
 * surface.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const routerPath = resolve(
  __dirname,
  "../../server/agent-studio/services/workspace-observability/router.ts",
);

describe("T-I.59 — listRecentFailureStateEvents admin tRPC", () => {
  const src = readFileSync(routerPath, "utf8");

  it("imports FAILURE_STATES from failure-states/contracts.js", () => {
    expect(
      /import\s*\{\s*FAILURE_STATES\s*\}\s*from\s*["']\.\.\/failure-states\/contracts\.js["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("imports failureStateErrorClass + summarizeFailureStateEventList from the bridge", () => {
    expect(
      /import\s*\{[\s\S]{0,200}failureStateErrorClass[\s\S]{0,200}summarizeFailureStateEventList[\s\S]{0,200}\}\s*from\s*["']\.\.\/failure-states\/observability-bridge\.js["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("mounts listRecentFailureStateEvents as adminProcedure.query (cross-workspace surface)", () => {
    expect(
      /listRecentFailureStateEvents:\s*adminProcedure[\s\S]{0,2000}\.query/.test(
        src,
      ),
    ).toBe(true);
  });

  it("zod input has optional limit (1..500) + optional createdSince", () => {
    expect(
      /listRecentFailureStateEvents[\s\S]{0,1500}limit:\s*z\.number\(\)\.int\(\)\.min\(1\)\.max\(500\)\.optional\(\)/.test(
        src,
      ),
    ).toBe(true);
    expect(
      /listRecentFailureStateEvents[\s\S]{0,1500}createdSince:\s*z\.coerce\.date\(\)\.optional\(\)/.test(
        src,
      ),
    ).toBe(true);
  });

  it("default limit is 200 (sane operator-dashboard default)", () => {
    expect(
      /listRecentFailureStateEvents[\s\S]{0,2000}limit:\s*input\?\.limit\s*\?\?\s*200/.test(
        src,
      ),
    ).toBe(true);
  });

  it("passes FAILURE_STATES.map(failureStateErrorClass) as the errorClass filter", () => {
    expect(
      /errorClass:\s*FAILURE_STATES\.map\(\s*failureStateErrorClass\s*\)/.test(
        src,
      ),
    ).toBe(true);
  });

  it("returns { rows, summary } shape with summary from summarizeFailureStateEventList", () => {
    expect(
      /return\s*\{\s*rows,\s*summary:\s*summarizeFailureStateEventList\(rows\)\s*,?\s*\}/.test(
        src,
      ),
    ).toBe(true);
  });

  it("forwards createdSince when present (last-24h dashboards)", () => {
    expect(
      /listRecentFailureStateEvents[\s\S]{0,2500}createdSince:\s*input\?\.createdSince/.test(
        src,
      ),
    ).toBe(true);
  });

  it("error path captures via throwTrpcAndCapture (matches sibling procedures)", () => {
    expect(
      /listRecentFailureStateEvents[\s\S]{0,3000}throwTrpcAndCapture\s*\(/.test(
        src,
      ),
    ).toBe(true);
  });
});
