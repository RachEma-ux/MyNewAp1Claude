/**
 * Retrofit jobs-by-lane companion — T-F.113 (T-F.7-β).
 *
 * Sister card to T-F.112 jobs-by-kind. Same 5-column shape, same
 * 4-axis input, different aggregation axis (first dot-segment of
 * jobKind). The data is pre-existing in getStats; this slice is
 * pure UI consumption.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function read(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/pages/RetrofitPage.tsx",
    ),
    "utf8",
  );
}

describe("Retrofit jobs-by-lane card (T-F.113 / T-F.7-β)", () => {
  it("card rendered IMMEDIATELY after JobsByKindBreakdownCard + BEFORE Error-events-system-vs-user", () => {
    const src = read();
    const kindIdx = src.indexOf("<JobsByKindBreakdownCard");
    const laneIdx = src.indexOf("<JobsByLaneBreakdownCard");
    const errIdx = src.indexOf("Error events — system vs user");
    expect(kindIdx).toBeGreaterThan(0);
    expect(laneIdx).toBeGreaterThan(0);
    expect(errIdx).toBeGreaterThan(0);
    expect(kindIdx).toBeLessThan(laneIdx);
    expect(laneIdx).toBeLessThan(errIdx);
  });

  it("card receives the 4 jobLane axes from s.* directly", () => {
    const src = read();
    expect(src).toMatch(
      /<JobsByLaneBreakdownCard[\s\S]{0,500}jobsByLane=\{s\.jobsByLane\}[\s\S]{0,300}failedJobsByLane=\{s\.failedJobsByLane\}[\s\S]{0,300}pendingJobsByLane=\{s\.pendingJobsByLane\}[\s\S]{0,300}runningJobsByLane=\{s\.runningJobsByLane\}/,
    );
  });

  it("JobsByLaneBreakdownCard component declared with 4-input Record<string,number> signature", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+JobsByLaneBreakdownCard\(\s*\{[\s\S]{0,200}jobsByLane,[\s\S]{0,100}failedJobsByLane,[\s\S]{0,100}pendingJobsByLane,[\s\S]{0,100}runningJobsByLane,[\s\S]{0,500}jobsByLane:\s*Record<string,\s*number>;[\s\S]{0,200}failedJobsByLane:\s*Record<string,\s*number>;[\s\S]{0,200}pendingJobsByLane:\s*Record<string,\s*number>;[\s\S]{0,200}runningJobsByLane:\s*Record<string,\s*number>;/,
    );
  });

  it("union-of-all-lanes + sort-by-total-desc derivation parallels jobs-by-kind", () => {
    const src = read();
    expect(src).toMatch(
      /const\s+allLanes\s*=\s*Array\.from\([\s\S]{0,400}new\s+Set<string>\(\s*\[[\s\S]{0,300}Object\.keys\(jobsByLane\)[\s\S]{0,150}Object\.keys\(failedJobsByLane\)[\s\S]{0,150}Object\.keys\(pendingJobsByLane\)[\s\S]{0,150}Object\.keys\(runningJobsByLane\)/,
    );
    expect(src).toMatch(
      /\.sort\(\(a,\s*b\)\s*=>\s*\(jobsByLane\[b\]\s*\?\?\s*0\)\s*-\s*\(jobsByLane\[a\]\s*\?\?\s*0\)\)/,
    );
  });

  it("5-column table with Lane header + per-lane testid + defensive ?? 0 cells", () => {
    const src = read();
    expect(src).toMatch(/data-testid=["']retrofit-jobs-by-lane-card["']/);
    expect(src).toMatch(/>\s*Lane\s*<\/th>/);
    expect(src).toMatch(
      /data-testid=\{`retrofit-jobs-by-lane-row-\$\{lane\}`\}/,
    );
    expect(src).toMatch(/\{jobsByLane\[lane\]\s*\?\?\s*0\}/);
    expect(src).toMatch(/\{failedJobsByLane\[lane\]\s*\?\?\s*0\}/);
    expect(src).toMatch(/\{pendingJobsByLane\[lane\]\s*\?\?\s*0\}/);
    expect(src).toMatch(/\{runningJobsByLane\[lane\]\s*\?\?\s*0\}/);
  });

  it("empty-state branches separately when allLanes.length === 0", () => {
    const src = read();
    expect(src).toMatch(
      /allLanes\.length\s*===\s*0\s*\?\s*\([\s\S]{0,300}data-testid=["']retrofit-jobs-by-lane-empty["']/,
    );
  });
});
