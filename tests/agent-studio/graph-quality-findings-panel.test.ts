/**
 * Graph Quality Findings panel — α-shell wiring (T-F.82 / T-F.4-α).
 *
 * First operator UI for the graph-quality findings stack. Consumes
 * the pre-existing `agentStudio.graphQuality.getStats` tRPC
 * procedure — no new server work. Source-scan integrity test locks
 * the consumer-side wiring + the canonical 4-site shell hookup so
 * future renames or surface drift fails loudly.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function readFile(rel: string): string {
  return readFileSync(resolve(__dirname, "../../", rel), "utf8");
}

describe("Graph Quality Findings α-shell wiring (T-F.82 / T-F.4-α)", () => {
  it("panel consumes the existing getStats tRPC procedure (no new server work)", () => {
    const src = readFile(
      "client/src/modules/agent-studio/components/GraphQualityFindingsPanel.tsx",
    );
    expect(src).toMatch(
      /trpc\.agentStudio\.graphQuality\.getStats\.useQuery/,
    );
    // The panel surfaces totals + by-status + by-severity bucket lists.
    expect(src).toMatch(/data-testid="graph-quality-totals-findings"/);
    expect(src).toMatch(/data-testid="graph-quality-totals-scans"/);
    expect(src).toMatch(/data-testid="graph-quality-totals-agent-runs"/);
    expect(src).toMatch(/findingsByStatus/);
    expect(src).toMatch(/findingsBySeverity/);
  });

  it("panel guards on isLoading + error + null data before render", () => {
    const src = readFile(
      "client/src/modules/agent-studio/components/GraphQualityFindingsPanel.tsx",
    );
    expect(src).toMatch(/statsQ\.isLoading/);
    expect(src).toMatch(
      /statsQ\.error[\s\S]{0,200}data-testid="graph-quality-findings-error"/,
    );
    expect(src).toMatch(/!statsQ\.data/);
  });

  it("each bucket row has a per-value testid for assertion ergonomics", () => {
    const src = readFile(
      "client/src/modules/agent-studio/components/GraphQualityFindingsPanel.tsx",
    );
    expect(src).toMatch(/data-testid=\{`graph-quality-bucket-\$\{b\.value\}`\}/);
  });

  it("page is a slim wrapper that mounts the panel", () => {
    const src = readFile(
      "client/src/modules/agent-studio/pages/GraphQualityFindingsPage.tsx",
    );
    expect(src).toMatch(/import\s+\{\s*GraphQualityFindingsPanel\s*\}/);
    expect(src).toMatch(/<GraphQualityFindingsPanel\s*\/>/);
  });

  it("AgentStudioShell wires lazy import + path parser + sidebar nav + render case (4 sites)", () => {
    const src = readFile(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );
    // 1. Lazy import.
    expect(src).toMatch(
      /const\s+GraphQualityFindingsPage\s*=\s*lazy\(\s*\(\)\s*=>\s*import\("\.\.\/pages\/GraphQualityFindingsPage"\)/,
    );
    // 2. Path parser.
    expect(src).toMatch(
      /path\.startsWith\("\/agent-studio\/graph-quality-findings"\)/,
    );
    // 3. Sidebar-nav case.
    expect(src).toMatch(
      /\(key as string\)\s*===\s*"graph-quality-findings"[\s\S]{0,200}navigate\("\/agent-studio\/graph-quality-findings"\)/,
    );
    // 4. Render case.
    expect(src).toMatch(
      /case\s+"graph-quality-findings"[\s\S]{0,200}<GraphQualityFindingsPage\s*\/>/,
    );
  });

  it("sidebar adds the Quality group with the ShieldAlert icon", () => {
    const src = readFile(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );
    expect(src).toMatch(/ShieldAlert,/);
    expect(src).toMatch(/"graph-quality-findings"/);
    expect(src).toMatch(
      /label:\s*"Quality"[\s\S]{0,300}label:\s*"Findings"[\s\S]{0,100}ShieldAlert/,
    );
  });

  it("routes.tsx adds the /agent-studio/graph-quality-findings route", () => {
    const src = readFile("client/src/modules/agent-studio/routes.tsx");
    expect(src).toMatch(
      /path:\s*"\/agent-studio\/graph-quality-findings"[\s\S]{0,200}label:\s*"Graph Quality Findings"/,
    );
  });
});
