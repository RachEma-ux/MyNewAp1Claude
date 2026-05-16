/**
 * T-I.60 — First UI consumer of `listRecentFailureStateEvents`
 * (admin tRPC shipped at T-I.59).
 *
 * Source-scan asserts a new Card on GraphHealthAdminPanel renders the
 * closed-taxonomy event summary (totalEvents / closedTaxonomyEvents /
 * freeFormEvents / distinctSourceKinds / oldestAt / newestAt) plus a
 * by-kind breakdown table sorted by descending count. Placement on
 * this panel is intentional — closed-taxonomy events skew
 * graph-health adjacent.
 *
 * Sibling to the T-I.59 source-scan (which pins the *router*); this
 * one pins the *UI consumer*.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const panelPath = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
);

describe("T-I.60 — failure-state events card on GraphHealthAdminPanel", () => {
  const src = readFileSync(panelPath, "utf8");

  it("binds the T-I.59 admin tRPC query", () => {
    expect(src).toContain(
      "trpc.agentStudio.workspaceObservability.listRecentFailureStateEvents.useQuery",
    );
  });

  it("passes a default limit of 50 (smaller than the tRPC's 200 default)", () => {
    expect(
      /listRecentFailureStateEvents\.useQuery\(\s*\{\s*limit:\s*50\s*\}/.test(
        src,
      ),
    ).toBe(true);
  });

  it("renders the summary grid with a stable testid", () => {
    expect(src).toContain(
      'data-testid="graph-health-failure-state-events-summary"',
    );
  });

  it("surfaces all six FailureStateEventListSummary fields", () => {
    expect(src).toContain("summary.totalEvents");
    expect(src).toContain("summary.closedTaxonomyEvents");
    expect(src).toContain("summary.freeFormEvents");
    expect(src).toContain("summary.distinctSourceKinds");
    expect(src).toContain("summary.oldestAt");
    expect(src).toContain("summary.newestAt");
  });

  it("freeFormEvents > 0 is highlighted amber (drift signal — operator should expand the wiring guard)", () => {
    expect(
      /summary\.freeFormEvents\s*>\s*0[\s\S]{0,100}text-amber/.test(src),
    ).toBe(true);
  });

  it("renders the by-kind breakdown table with a stable testid", () => {
    expect(src).toContain(
      'data-testid="graph-health-failure-state-events-by-kind-table"',
    );
  });

  it("by-kind table is gated on closedTaxonomyEvents > 0 (empty workspace = no table)", () => {
    expect(
      /summary\.closedTaxonomyEvents\s*>\s*0[\s\S]{0,300}graph-health-failure-state-events-by-kind-table/.test(
        src,
      ),
    ).toBe(true);
  });

  it("by-kind rows iterate occurrenceSummary.byKind via Object.entries", () => {
    expect(src).toContain(
      "Object.entries(\n                        failureStateEventsQ.data.summary.occurrenceSummary\n                          .byKind,\n                      )",
    );
  });

  it("by-kind rows filter out zero-count kinds (stable-shape aggregator → don't render 25 rows of zeros)", () => {
    expect(/\.filter\(\(\[, n\]\) => \(n as number\) > 0\)/.test(src)).toBe(true);
  });

  it("by-kind rows sorted by descending count", () => {
    expect(
      /\.sort\(\s*\(\[, a\],\s*\[, b\]\)\s*=>\s*\(b as number\)\s*-\s*\(a as number\)/.test(
        src,
      ),
    ).toBe(true);
  });

  it("loading + error + null-data branches all render explicit messages", () => {
    expect(src).toContain("Loading recent failure-state events…");
    expect(src).toContain("Failed to load failure-state events:");
    expect(/failureStateEventsQ\.data\s*==\s*null/.test(src)).toBe(true);
  });
});
