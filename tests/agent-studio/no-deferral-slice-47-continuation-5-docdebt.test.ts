/**
 * No-Deferral continuation-5 slice 47 — doc-debt source-scan lockstep.
 *
 * Pins the 2 stale-marker rewrites against their named successors so
 * the markers don't drift back if someone copy-pastes the prior
 * deferred text from git history.
 *
 * Both source files are excluded from `pnpm check` (`tsconfig.json`
 * `services/**` exclusion); pure source-scan tests have no DB / no
 * boot dependency and exercise the comment shape directly.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../..");

function readSource(relPath: string): string {
  return readFileSync(path.join(REPO_ROOT, relPath), "utf8");
}

describe("no-deferral slice 47 — continuation-5 doc-debt lockstep", () => {
  describe("system-prompt-composer.ts — RAC P5 marker rewritten", () => {
    const src = readSource(
      "server/agent-studio/services/runtime/system-prompt-composer.ts",
    );

    it("does NOT carry the stale 'placeholder until P5' text", () => {
      expect(src).not.toContain("placeholder until P5");
    });

    it("names the live successor (RAC P5 shipped)", () => {
      expect(src).toMatch(/RAC P5 — shipped/);
    });

    it("retrieval-evidence section header reflects shipped state", () => {
      expect(src).toContain(
        "// ── 5. retrieval-evidence (RAC P5 — shipped) ─",
      );
    });

    it("retrievalEvidence field doc does NOT carry the stale 'until P5 lands' text", () => {
      expect(src).not.toContain("Always null until P5 lands");
    });

    it("retrievalEvidence field doc names the live state", () => {
      expect(src).toMatch(/RAC assembler[\s\n*]+\(P5 — shipped/);
    });
  });

  describe("api/router.ts — T-G.5.β marker rewritten", () => {
    const src = readSource("server/agent-studio/api/router.ts");

    it("does NOT carry the stale 'deferred to a future T-G.5.β' text", () => {
      expect(src).not.toContain("deferred to a future T-G.5.β");
    });

    it("names the live successor (impact-analysis-templates.ts)", () => {
      expect(src).toContain(
        "services/graph-lens/impact-analysis-templates.ts",
      );
    });

    it("names the slice that shipped T-G.5.β (catalogue slice 29)", () => {
      expect(src).toMatch(
        /no-deferral[\s\n/*]+catalogue[\s\n/*]+slice[\s\n/*]+29/,
      );
    });

    it("names the mode discriminant operator dashboards bind to", () => {
      expect(src).toContain('classifyImpactAnalysisExecutorMode');
    });
  });
});
