/**
 * RetrofitPage lane-click fusion + per-lane rollups — source-scan integrity.
 *
 * Slice 22 of the no-deferral catalogue (2026-05-19). Closes the
 * "Precedent (j₂) clickable-rollup fusion is deferred to a follow-up"
 * note + the "per-lane rollups stay deferred until operators ask"
 * note from earlier in the same file.
 *
 * Locks the lane-click drill semantics so a refactor can't accidentally
 * regress to the deferred shape.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const PAGE_PATH = join(
  process.cwd(),
  "client/src/modules/agent-studio/pages/RetrofitPage.tsx",
);

describe("RetrofitPage — slice 22 lane-click drill", () => {
  const src = readFileSync(PAGE_PATH, "utf8");

  it("doc-block no longer carries the 'per-lane rollups stay deferred' marker", () => {
    expect(src).not.toMatch(/per-lane rollups stay deferred/);
  });

  it("doc-block no longer carries 'clickable-rollup fusion is deferred to a follow-up'", () => {
    expect(src).not.toMatch(/clickable-rollup fusion is deferred to a follow-up/);
  });

  it("page lifts lane-filter state alongside retry/cancel kind state", () => {
    expect(src).toMatch(/const \[laneFilter, setLaneFilter\] = useState<string>/);
  });

  it("handleLaneClick toggles the lane filter + switches the observability-stats tab", () => {
    expect(src).toMatch(/function handleLaneClick\(lane: string\)/);
    expect(src).toMatch(/setLaneFilter\(\(prev\) => \(prev === lane \? "" : lane\)\)/);
    expect(src).toMatch(/setTabValue\("observability-stats"\)/);
  });

  it("ObservabilityStatsPanel receives the new lane props", () => {
    expect(src).toMatch(
      /<ObservabilityStatsPanel[\s\S]{0,250}onClickLane=\{handleLaneClick\}[\s\S]{0,250}laneFilter=\{laneFilter\}/,
    );
  });

  it("filterByLanePrefix helper is defined + applied to all 4 kind axes", () => {
    expect(src).toMatch(/function filterByLanePrefix\(/);
    const m =
      src.match(/jobsByKind=\{filterByLanePrefix\(s\.jobsByKind, laneFilter\)\}/) ?? [];
    expect(m.length).toBe(1);
    expect(src).toMatch(/filterByLanePrefix\(s\.failedJobsByKind, laneFilter\)/);
    expect(src).toMatch(/filterByLanePrefix\(s\.pendingJobsByKind, laneFilter\)/);
    expect(src).toMatch(/filterByLanePrefix\(s\.runningJobsByKind, laneFilter\)/);
  });

  it("JobsByLaneBreakdownCard accepts onClickLane + activeLane", () => {
    expect(src).toMatch(/onClickLane\?:\s*\(lane: string\) => void/);
    expect(src).toMatch(/activeLane\?:\s*string/);
  });

  it("Lane cell renders a clickable button when onClickLane is set", () => {
    // Match the template-literal string literally (backtick delimited).
    expect(src).toContain("data-testid={`retrofit-jobs-by-lane-row-${lane}-click`}");
  });

  it("Active lane row gets a highlighted background + text color", () => {
    expect(src).toMatch(/lane === activeLane \? "bg-blue-950\/30" : ""/);
  });

  it("Jobs-by-kind card surfaces a banner when filtered to a lane", () => {
    expect(src).toMatch(
      /data-testid="retrofit-jobs-by-kind-lane-filter-banner"/,
    );
  });

  it("Toggle semantics — clicking the same lane twice clears the filter", () => {
    expect(src).toMatch(/Click the lane row again to clear/);
  });
});
