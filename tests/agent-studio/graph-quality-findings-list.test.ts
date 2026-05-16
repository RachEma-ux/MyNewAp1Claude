/**
 * Graph Quality Findings list — β-slice (T-F.83 / T-F.4-β).
 *
 * Extends T-F.82's stats α-shell with a recent-findings list Card
 * consuming the pre-existing `listFindings` tRPC. Source-scan
 * integrity test locks the limit + per-row testid + the 5-column
 * table shape.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function readPanel(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/GraphQualityFindingsPanel.tsx",
    ),
    "utf8",
  );
}

describe("Graph Quality Findings list β-slice (T-F.83 / T-F.4-β)", () => {
  it("panel consumes listFindings with the FINDINGS_LIST_LIMIT cap", () => {
    const src = readPanel();
    expect(src).toMatch(
      /trpc\.agentStudio\.graphQuality\.listFindings\.useQuery/,
    );
    expect(src).toMatch(/const\s+FINDINGS_LIST_LIMIT\s*=\s*50/);
    expect(src).toMatch(/limit:\s*FINDINGS_LIST_LIMIT/);
  });

  it("findings list table renders id / class / severity / status / source (5 data columns; T-F.89 added a leading checkbox col)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /<thead>[\s\S]{0,1200}<th[^>]*>id<\/th>[\s\S]{0,200}<th[^>]*>class<\/th>[\s\S]{0,200}<th[^>]*>severity<\/th>[\s\S]{0,200}<th[^>]*>status<\/th>[\s\S]{0,200}<th[^>]*>source<\/th>/,
    );
  });

  it("each finding row has a per-id testid", () => {
    const src = readPanel();
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-row-\$\{f\.id\}`\}/,
    );
  });

  it("empty + loading + error states all have testid-tagged surfaces", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-quality-findings-list-empty"/);
    expect(src).toMatch(/data-testid="graph-quality-findings-list-error"/);
    expect(src).toMatch(/data-testid="graph-quality-findings-list"/);
  });

  it("header copy reflects the LIMIT-hit case with 'first N, newest first'", () => {
    const src = readPanel();
    expect(src).toMatch(/first \$\{FINDINGS_LIST_LIMIT\}, newest first/);
  });

  it("source cell combines sourceTypeKey + sourceId with a colon separator", () => {
    const src = readPanel();
    expect(src).toMatch(/f\.sourceTypeKey\s*\?\?\s*"—"/);
    expect(src).toMatch(/f\.sourceId\s*\?\s*`:\s*\$\{f\.sourceId\}`/);
  });
});
