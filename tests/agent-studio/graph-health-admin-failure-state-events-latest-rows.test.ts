/**
 * T-I.62 — Latest rows table on the T-I.60 failure-state events card.
 *
 * T-I.59 fetches up to 50 rows but T-I.60 + T-I.61 only render
 * summary + by-kind/by-source-kind aggregates — the raw events
 * themselves were unrendered. This section adds a 4-column table
 * (Created / Kind / Source kind / Message) truncated to the
 * most-recent 15 so operators can investigate specific failures
 * without leaving the panel.
 *
 * Source-scan asserts:
 *   1. New table testid is present.
 *   2. Header advertises the truncation (most-recent N of M).
 *   3. Rows truncated to .slice(0, 15).
 *   4. `failure_state:` prefix stripped from errorClass for readability.
 *   5. All 4 row fields rendered (createdAt + errorClass + sourceKind + errorMessage).
 *   6. Render gated on rows.length > 0.
 *   7. Rows keyed by id for React reconciliation.
 *   8. Message column truncates with max-w (don't blow up the table layout).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const panelPath = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
);

describe("T-I.62 — latest-rows table on T-I.60 failure-state events card", () => {
  const src = readFileSync(panelPath, "utf8");

  it("renders the latest-rows table with a stable testid", () => {
    expect(src).toContain(
      'data-testid="graph-health-failure-state-events-latest-rows-table"',
    );
  });

  it("header advertises truncation: 'most-recent N of M sampled'", () => {
    expect(src).toContain("Latest rows (most-recent");
    expect(src).toContain("Math.min(15, failureStateEventsQ.data.rows.length)");
    expect(src).toContain("sampled)");
    // The 'of' connector + the rows.length reference are split across
    // JSX lines via `{" "}` — assert both halves are present.
    expect(src).toContain("} of{");
    expect(src).toContain("{failureStateEventsQ.data.rows.length}");
  });

  it("rows truncated to .slice(0, 15)", () => {
    expect(
      /failureStateEventsQ\.data\.rows\s*\.slice\(0,\s*15\)/.test(src),
    ).toBe(true);
  });

  it("strips the `failure_state:` prefix for readability", () => {
    expect(src).toContain('r.errorClass.startsWith("failure_state:")');
    expect(src).toContain('r.errorClass.slice(');
    expect(src).toContain('"failure_state:".length');
  });

  it("free-form errorClass passes through unchanged (defensive fallthrough)", () => {
    expect(/:\s*r\.errorClass\s*}/.test(src)).toBe(true);
  });

  it("renders all 4 row fields (createdAt + kind + sourceKind + message)", () => {
    expect(src).toContain("fmtTs(r.createdAt)");
    expect(src).toContain("{r.sourceKind}");
    expect(src).toContain("{r.errorMessage}");
  });

  it("renders 4 column headers (Created / Kind / Source kind / Message)", () => {
    expect(
      /graph-health-failure-state-events-latest-rows-table[\s\S]{0,800}<th[^>]*>Created<\/th>[\s\S]{0,400}<th[^>]*>Kind<\/th>[\s\S]{0,400}<th[^>]*>Source kind<\/th>[\s\S]{0,400}<th[^>]*>Message<\/th>/.test(
        src,
      ),
    ).toBe(true);
  });

  it("render gated on rows.length > 0", () => {
    expect(
      /failureStateEventsQ\.data\.rows\.length\s*>\s*0[\s\S]{0,2000}graph-health-failure-state-events-latest-rows-table/.test(
        src,
      ),
    ).toBe(true);
  });

  it("rows keyed by id for React reconciliation", () => {
    expect(
      /\.slice\(0,\s*15\)[\s\S]{0,500}key=\{r\.id\}/.test(src),
    ).toBe(true);
  });

  it("Message column truncates with max-width (preserves table layout)", () => {
    expect(
      /truncate\s+max-w-\[40ch\][\s\S]{0,200}r\.errorMessage/.test(src),
    ).toBe(true);
  });

  it("renders inside the existing failure-state events card (not a new Card)", () => {
    const byKindIdx = src.indexOf(
      'data-testid="graph-health-failure-state-events-by-kind-table"',
    );
    const latestIdx = src.indexOf(
      'data-testid="graph-health-failure-state-events-latest-rows-table"',
    );
    expect(byKindIdx).toBeGreaterThan(0);
    expect(latestIdx).toBeGreaterThan(byKindIdx);
    const between = src.slice(byKindIdx, latestIdx);
    expect(between).not.toMatch(/<Card>/);
  });
});
