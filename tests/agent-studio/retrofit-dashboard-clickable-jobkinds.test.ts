/**
 * Retrofit ObservabilityDashboardPanel clickable jobKinds —
 * T-F.126 (T-F.7-j₂ extension).
 *
 * Extends T-F.125's clickable-rollup state-lift to 4 ObservabilityDashboardPanel
 * recent-jobs lists: recent failed / recent completed / stale running /
 * oldest pending. Each renders jobKind via the new `JobKindCell` helper
 * which branches: `<button>` when `onClickKind` set (with `-click`
 * testid + title hint), plain text otherwise.
 *
 * Recent error events list is intentionally unchanged because its
 * discriminator (`sourceKind`) is not a valid jobKind for the
 * retry/cancel forms.
 *
 * Source-scan locks the helper signature + 4 invocations + skip of
 * recent error events + dashboard panel signature gains onClickKind +
 * RetrofitPage wires handleKindClick down.
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

describe("Retrofit dashboard clickable jobKinds (T-F.126 / T-F.7-j₂ extension)", () => {
  it("JobKindCell helper declared with 2-prop signature + optional onClickKind", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+JobKindCell\(\s*\{[\s\S]{0,200}jobKind,[\s\S]{0,100}onClickKind,[\s\S]{0,500}jobKind:\s*string;[\s\S]{0,200}onClickKind\?:\s*\(kind:\s*string\)\s*=>\s*void;?/,
    );
  });

  it("JobKindCell branches on onClickKind presence (button vs plain span)", () => {
    const src = read();
    expect(src).toMatch(
      /if\s*\(!onClickKind\)\s*\{[\s\S]{0,300}return\s+<span[\s\S]{0,200}\{jobKind\}<\/span>/,
    );
    expect(src).toMatch(
      /<button[\s\S]{0,500}onClick=\{\(\)\s*=>\s*onClickKind\(jobKind\)\}[\s\S]{0,300}data-testid=\{`retrofit-dashboard-jobkind-\$\{jobKind\}-click`\}/,
    );
  });

  it("ObservabilityDashboardPanel signature gains optional onClickKind prop", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+ObservabilityDashboardPanel\(\s*\{\s*onClickKind,?\s*\}:\s*\{[\s\S]{0,400}onClickKind\?:\s*\(kind:\s*string\)\s*=>\s*void;?\s*\}\s*\)/,
    );
  });

  it("RetrofitPage passes handleKindClick down to dashboard panel", () => {
    const src = read();
    expect(src).toMatch(
      /<ObservabilityDashboardPanel\s+onClickKind=\{handleKindClick\}\s*\/>/,
    );
  });

  it("JobKindCell invoked in 4 lists: recent failed, recent completed, stale running, oldest pending", () => {
    const src = read();
    // Recent failed jobs list:
    expect(src).toMatch(
      /title="Recent failed jobs"[\s\S]{0,800}<JobKindCell\s+jobKind=\{j\.jobKind\}\s+onClickKind=\{onClickKind\}/,
    );
    // Recent completed jobs list:
    expect(src).toMatch(
      /title="Recent completed jobs"[\s\S]{0,500}<JobKindCell\s+jobKind=\{j\.jobKind\}\s+onClickKind=\{onClickKind\}/,
    );
    // Stale running jobs list:
    expect(src).toMatch(
      /title="Stale running jobs"[\s\S]{0,500}<JobKindCell\s+jobKind=\{j\.jobKind\}\s+onClickKind=\{onClickKind\}/,
    );
    // Oldest pending jobs list:
    expect(src).toMatch(
      /title="Oldest pending jobs"[\s\S]{0,800}<JobKindCell\s+jobKind=\{j\.jobKind\}\s+onClickKind=\{onClickKind\}/,
    );
  });

  it("Recent error events list intentionally unchanged (sourceKind, not jobKind)", () => {
    const src = read();
    // The recent error events list renders sourceKind on its own
    // line. Assert: it's still a plain `<div>{e.sourceKind}</div>`
    // and does NOT invoke JobKindCell.
    expect(src).toMatch(
      /title="Recent error events"[\s\S]{0,800}\{e\.sourceKind\}/,
    );
    expect(src).not.toMatch(
      /title="Recent error events"[\s\S]{0,800}<JobKindCell/,
    );
  });

  it("JobKindCell exhausts to 4 invocations total inside ObservabilityDashboardPanel (no over-application)", () => {
    const src = read();
    const matches = src.match(/<JobKindCell/g) ?? [];
    expect(matches.length).toBe(4);
  });
});
