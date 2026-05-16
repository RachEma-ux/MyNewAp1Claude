/**
 * T-I.63 — Optional `kind` + `sourceKind` filters on
 * `listRecentFailureStateEvents`.
 *
 * The T-I.59 admin tRPC fetches the 25-kind closed-taxonomy slice
 * capped at 200 rows. When a loud kind dominates the buffer (e.g.
 * `graph_query_timeout` during an incident), operators investigating
 * a quieter kind can lose tail visibility. T-I.63 adds two optional
 * narrowers — both pass-through to the underlying `listErrorEvents`:
 *
 *   - `kind?: FailureState[]` — pre-filters the `errorClass IN` list
 *     so the buffer is dedicated to the operator's chosen kinds.
 *   - `sourceKind?: string | string[]` — pass-through that mirrors
 *     the parent procedure's shape (single string or array up to 20).
 *
 * Source-scan asserts:
 *   1. `kind` input shape is `z.enum(FAILURE_STATES).array().min(1).max(25).optional()`.
 *   2. `sourceKind` input shape mirrors `listErrorEvents` (union of string + array).
 *   3. Default fallback: when `kind` is undefined, the full `FAILURE_STATES` set is used.
 *   4. The errorClass IN list is composed from the chosen kinds via `failureStateErrorClass`.
 *   5. `sourceKind` is passed through to `listErrorEvents`.
 *   6. The existing `limit` + `createdSince` filters are preserved.
 *   7. The procedure is still pinned to `adminProcedure` (cross-workspace surface).
 *   8. Existing `summarizeFailureStateEventList` shaping is unchanged.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const routerPath = resolve(
  __dirname,
  "../../server/agent-studio/services/workspace-observability/router.ts",
);

describe("T-I.63 — kind + sourceKind filters on listRecentFailureStateEvents", () => {
  const src = readFileSync(routerPath, "utf8");

  it("declares the procedure name with admin scope", () => {
    expect(
      /listRecentFailureStateEvents:\s*adminProcedure/.test(src),
    ).toBe(true);
  });

  it("input shape includes the closed-taxonomy `kind` enum array", () => {
    expect(src).toContain(
      "kind: z.enum(FAILURE_STATES).array().min(1).max(25).optional()",
    );
  });

  it("input shape includes a `sourceKind` union matching listErrorEvents", () => {
    // single string OR array up to 20, pass-through pattern.
    expect(
      /sourceKind:\s*z\s*\.union\(\s*\[\s*z\.string\(\)\.min\(1\)\.max\(100\)[\s\S]{0,400}z\.array\(z\.string\(\)\.min\(1\)\.max\(100\)\)\.max\(20\)/.test(
        src,
      ),
    ).toBe(true);
  });

  it("falls back to the full FAILURE_STATES set when `kind` is undefined", () => {
    expect(src).toContain("const kinds = input?.kind ?? FAILURE_STATES;");
  });

  it("composes the errorClass IN list from the chosen kinds", () => {
    expect(src).toContain("errorClass: kinds.map(failureStateErrorClass)");
  });

  it("passes `sourceKind` through to listErrorEvents", () => {
    expect(src).toContain("sourceKind: input?.sourceKind");
  });

  it("preserves the existing `limit` default + `createdSince` pass-through", () => {
    expect(src).toContain("limit: input?.limit ?? 200");
    expect(src).toContain("createdSince: input?.createdSince");
  });

  it("preserves the summarize-by-kind shaping on the response", () => {
    expect(src).toContain("summary: summarizeFailureStateEventList(rows)");
  });

  it("free-form errorClass rows still excluded — closed-taxonomy subset only", () => {
    // The mapping is always `kinds.map(failureStateErrorClass)`, so
    // background_job_failed-as-free-form / raw tRPC errors never
    // leak in. Defensive assert: no `LIKE 'failure_state:%'` pattern
    // got introduced — we stay on the explicit IN-list.
    expect(src).not.toMatch(/failure_state:%/);
  });

  it("the new filters live inside the listRecentFailureStateEvents block (not on listErrorEvents)", () => {
    // Section indices to anchor the assertion: kind appears AFTER
    // the listRecentFailureStateEvents declaration and BEFORE the
    // next procedure (getErrorEventById).
    const startIdx = src.indexOf("listRecentFailureStateEvents: adminProcedure");
    const endIdx = src.indexOf("getErrorEventById:", startIdx);
    expect(startIdx).toBeGreaterThan(0);
    expect(endIdx).toBeGreaterThan(startIdx);
    const section = src.slice(startIdx, endIdx);
    expect(section).toContain(
      "kind: z.enum(FAILURE_STATES).array().min(1).max(25).optional()",
    );
    expect(section).toContain("kinds.map(failureStateErrorClass)");
  });
});
