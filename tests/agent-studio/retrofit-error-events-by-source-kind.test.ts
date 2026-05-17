/**
 * Retrofit error-events-by-source-kind — T-F.114 (T-F.7-γ).
 *
 * Third precedent (o)-discriminator slice on RetrofitPage. Different
 * shape from jobs cards: single-axis count (no failed/pending/running
 * operational status). Extracts a reusable SingleAxisBreakdownCard
 * helper that the next 3 candidate cards (errorEventsByLane,
 * errorEventsByErrorClass, workspace-wide notificationsByKind) can
 * all reuse without re-implementing the table chrome.
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

describe("Retrofit error-events-by-source-kind (T-F.114 / T-F.7-γ)", () => {
  it("card inserted AFTER JobsByLaneBreakdownCard + BEFORE Error-events-system-vs-user", () => {
    const src = read();
    const laneIdx = src.indexOf("<JobsByLaneBreakdownCard");
    const cardIdx = src.indexOf(
      'title="Error events by source kind"',
    );
    const errIdx = src.indexOf("Error events — system vs user");
    expect(laneIdx).toBeGreaterThan(0);
    expect(cardIdx).toBeGreaterThan(0);
    expect(errIdx).toBeGreaterThan(0);
    expect(laneIdx).toBeLessThan(cardIdx);
    expect(cardIdx).toBeLessThan(errIdx);
  });

  it("card uses the reusable SingleAxisBreakdownCard helper with all required props", () => {
    const src = read();
    expect(src).toMatch(
      /<SingleAxisBreakdownCard[\s\S]{0,500}title="Error events by source kind"[\s\S]{0,200}rowLabel="Source kind"[\s\S]{0,200}data=\{s\.errorEventsBySourceKind\}[\s\S]{0,200}testidPrefix="retrofit-error-events-by-source-kind"[\s\S]{0,200}emptyCopy="No error events recorded\."/,
    );
  });

  it("SingleAxisBreakdownCard helper component declared with full 5-prop signature", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+SingleAxisBreakdownCard\(\s*\{[\s\S]{0,200}title,[\s\S]{0,100}rowLabel,[\s\S]{0,100}data,[\s\S]{0,100}testidPrefix,[\s\S]{0,100}emptyCopy,[\s\S]{0,500}title:\s*string;[\s\S]{0,200}rowLabel:\s*string;[\s\S]{0,200}data:\s*Record<string,\s*number>;[\s\S]{0,200}testidPrefix:\s*string;[\s\S]{0,200}emptyCopy:\s*string;/,
    );
  });

  it("helper sorts entries by count descending + uses 2-column table (rowLabel + Count)", () => {
    const src = read();
    expect(src).toMatch(
      /const\s+entries\s*=\s*Object\.entries\(data\)\.sort\(\(a,\s*b\)\s*=>\s*b\[1\]\s*-\s*a\[1\]\)/,
    );
    expect(src).toMatch(/\{rowLabel\}/);
    expect(src).toMatch(/>\s*Count\s*<\/th>/);
  });

  it("helper emits dynamic testids from testidPrefix (card / row-<k> / empty)", () => {
    const src = read();
    expect(src).toMatch(/data-testid=\{`\$\{testidPrefix\}-card`\}/);
    expect(src).toMatch(/data-testid=\{`\$\{testidPrefix\}-row-\$\{k\}`\}/);
    expect(src).toMatch(/data-testid=\{`\$\{testidPrefix\}-empty`\}/);
  });

  it("helper renders empty-copy text when entries.length === 0", () => {
    const src = read();
    expect(src).toMatch(
      /entries\.length\s*===\s*0\s*\?\s*\([\s\S]{0,300}\{emptyCopy\}/,
    );
  });
});
