/**
 * T-I.61 — Per-source-kind breakdown table on the T-I.60 failure-state
 * events card.
 *
 * The T-I.59 admin tRPC returns the raw `rows` alongside the summary;
 * `summary.distinctSourceKinds` is just a count. To answer "which
 * emitter is loudest right now" operators need the per-source
 * histogram, computed client-side via a single Map<string, number>
 * reduce over `rows`. No server change — pure UI extension on the
 * T-I.60 card.
 *
 * Source-scan asserts:
 *   1. New table testid is present.
 *   2. Section header includes the sampled-row count for clarity.
 *   3. Render gated on `rows.length > 0` (empty workspace skips).
 *   4. Aggregation via `new Map<string, number>()` reducer.
 *   5. Sort by descending count.
 *   6. Stable column shape (Source kind / Count).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const panelPath = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
);

describe("T-I.61 — per-source-kind breakdown table", () => {
  const src = readFileSync(panelPath, "utf8");

  it("renders the by-source-kind table with a stable testid", () => {
    expect(src).toContain(
      'data-testid="graph-health-failure-state-events-by-source-kind-table"',
    );
  });

  it("section header includes the sampled-row count", () => {
    expect(src).toContain(
      "Per source-kind (over the {failureStateEventsQ.data.rows.length}",
    );
  });

  it("render gated on rows.length > 0 (empty workspace = no table)", () => {
    expect(
      /failureStateEventsQ\.data\.rows\.length\s*>\s*0[\s\S]{0,1500}graph-health-failure-state-events-by-source-kind-table/.test(
        src,
      ),
    ).toBe(true);
  });

  it("aggregates client-side via new Map<string, number>() reducer", () => {
    expect(src).toContain("new Map<string, number>()");
    expect(src).toContain("counts.set(");
    expect(src).toContain("counts.get(r.sourceKind)");
  });

  it("sort by descending count", () => {
    expect(
      /Array\.from\(counts\.entries\(\)\)\s*\.sort\(\(\[, a\],\s*\[, b\]\)\s*=>\s*b\s*-\s*a\)/.test(
        src,
      ),
    ).toBe(true);
  });

  it("renders Source kind + Count columns", () => {
    expect(
      /graph-health-failure-state-events-by-source-kind-table[\s\S]{0,800}<th[^>]*>Source kind<\/th>[\s\S]{0,200}<th[^>]*>Count<\/th>/.test(
        src,
      ),
    ).toBe(true);
  });

  it("keys table rows by sourceKind for React reconciliation", () => {
    expect(
      /Array\.from\(counts\.entries\(\)\)[\s\S]{0,500}key=\{sourceKind\}/.test(
        src,
      ),
    ).toBe(true);
  });

  it("renders the table inside the existing failure-state events card (not a new Card)", () => {
    // The new table must appear *between* the by-kind table and the
    // closing </CardContent> of the failure-state events card. We
    // assert there's no intervening <Card> open tag.
    const byKindIdx = src.indexOf(
      'data-testid="graph-health-failure-state-events-by-kind-table"',
    );
    const bySourceIdx = src.indexOf(
      'data-testid="graph-health-failure-state-events-by-source-kind-table"',
    );
    expect(byKindIdx).toBeGreaterThan(0);
    expect(bySourceIdx).toBeGreaterThan(byKindIdx);
    const between = src.slice(byKindIdx, bySourceIdx);
    expect(between).not.toMatch(/<Card>/);
  });
});
