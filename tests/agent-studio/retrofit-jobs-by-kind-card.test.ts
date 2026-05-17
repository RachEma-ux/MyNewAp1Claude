/**
 * Retrofit jobs-by-kind breakdown — T-F.112 (T-F.7-α).
 *
 * Second precedent (o)-discriminator territory opener of the
 * session (after Inbox T-F.107-T-F.111). Surfaces the `jobsByKind`
 * / `failedJobsByKind` / `pendingJobsByKind` / `runningJobsByKind`
 * quartet from `getStats` that has been live since stats.ts
 * shipped but only surfaced via per-row `j.jobKind` labels on the
 * recent-jobs lists.
 *
 * Per panel-saturation precedent (h): existing operator surface
 * (RetrofitPage) gets a new aggregate card; no new tRPC, no new
 * routing — pure UI consumption of pre-existing aggregated data.
 *
 * Source-scan locks:
 * - card insertion point (after Jobs-by-status, before Error-events)
 * - JobsByKindBreakdownCard component with 4-input prop signature
 * - union-of-all-kinds + sort-by-total-desc semantics
 * - 5-column table (Kind / Total / Failed / Pending / Running)
 * - per-row testid + empty-state branching
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

describe("Retrofit jobs-by-kind card (T-F.112 / T-F.7-α)", () => {
  it("card is rendered AFTER Jobs-by-status AND BEFORE Error-events-system-vs-user", () => {
    const src = read();
    const statusIdx = src.indexOf("Jobs by status");
    const cardIdx = src.indexOf("<JobsByKindBreakdownCard");
    const errIdx = src.indexOf("Error events — system vs user");
    expect(statusIdx).toBeGreaterThan(0);
    expect(cardIdx).toBeGreaterThan(0);
    expect(errIdx).toBeGreaterThan(0);
    expect(statusIdx).toBeLessThan(cardIdx);
    expect(cardIdx).toBeLessThan(errIdx);
  });

  it("card receives the 4 jobKind axes from s.* directly (no client-side aggregation)", () => {
    const src = read();
    expect(src).toMatch(
      /<JobsByKindBreakdownCard[\s\S]{0,500}jobsByKind=\{s\.jobsByKind\}[\s\S]{0,300}failedJobsByKind=\{s\.failedJobsByKind\}[\s\S]{0,300}pendingJobsByKind=\{s\.pendingJobsByKind\}[\s\S]{0,300}runningJobsByKind=\{s\.runningJobsByKind\}/,
    );
  });

  it("JobsByKindBreakdownCard component declared with the 4-input Record<string,number> signature", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+JobsByKindBreakdownCard\(\s*\{[\s\S]{0,200}jobsByKind,[\s\S]{0,100}failedJobsByKind,[\s\S]{0,100}pendingJobsByKind,[\s\S]{0,100}runningJobsByKind,[\s\S]{0,500}jobsByKind:\s*Record<string,\s*number>;[\s\S]{0,200}failedJobsByKind:\s*Record<string,\s*number>;[\s\S]{0,200}pendingJobsByKind:\s*Record<string,\s*number>;[\s\S]{0,200}runningJobsByKind:\s*Record<string,\s*number>;/,
    );
  });

  it("union-of-all-kinds + sort-by-total-desc derivation", () => {
    const src = read();
    expect(src).toMatch(
      /const\s+allKinds\s*=\s*Array\.from\([\s\S]{0,400}new\s+Set<string>\(\s*\[[\s\S]{0,300}Object\.keys\(jobsByKind\)[\s\S]{0,150}Object\.keys\(failedJobsByKind\)[\s\S]{0,150}Object\.keys\(pendingJobsByKind\)[\s\S]{0,150}Object\.keys\(runningJobsByKind\)/,
    );
    expect(src).toMatch(
      /\.sort\(\(a,\s*b\)\s*=>\s*\(jobsByKind\[b\]\s*\?\?\s*0\)\s*-\s*\(jobsByKind\[a\]\s*\?\?\s*0\)\)/,
    );
  });

  it("5-column table with Kind/Total/Failed/Pending/Running headers", () => {
    const src = read();
    expect(src).toMatch(/data-testid=["']retrofit-jobs-by-kind-card["']/);
    expect(src).toMatch(/>\s*Kind\s*<\/th>/);
    expect(src).toMatch(/>\s*Total\s*<\/th>/);
    expect(src).toMatch(/>\s*Failed\s*<\/th>/);
    expect(src).toMatch(/>\s*Pending\s*<\/th>/);
    expect(src).toMatch(/>\s*Running\s*<\/th>/);
  });

  it("each kind row has per-kind testid AND 5 cells (kind label + 4 counts) with defensive ?? 0", () => {
    const src = read();
    expect(src).toMatch(
      /data-testid=\{`retrofit-jobs-by-kind-row-\$\{k\}`\}/,
    );
    expect(src).toMatch(/\{jobsByKind\[k\]\s*\?\?\s*0\}/);
    expect(src).toMatch(/\{failedJobsByKind\[k\]\s*\?\?\s*0\}/);
    expect(src).toMatch(/\{pendingJobsByKind\[k\]\s*\?\?\s*0\}/);
    expect(src).toMatch(/\{runningJobsByKind\[k\]\s*\?\?\s*0\}/);
  });

  it("empty-state branches separately when allKinds.length === 0", () => {
    const src = read();
    expect(src).toMatch(
      /allKinds\.length\s*===\s*0\s*\?\s*\([\s\S]{0,300}data-testid=["']retrofit-jobs-by-kind-empty["']/,
    );
    expect(src).toMatch(/No jobs recorded/);
  });
});
