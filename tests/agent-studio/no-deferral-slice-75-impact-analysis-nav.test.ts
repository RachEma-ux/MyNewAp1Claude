/**
 * No-Deferral continuation-14 slice 75 — Impact Analysis admin
 * surface source-scan lockstep.
 *
 * Per continuation-10 completion-audit lesson #1 (ship all 7 nav-
 * surface items in one slice), this pin asserts the page is wired
 * into every one of:
 *   1. Page file
 *   2. Lazy import in AgentStudioShell
 *   3. Route resolution
 *   4. View switch case
 *   5. Navigation-key dispatch
 *   6. `AgentStudioView` discriminated-union entry
 *   7. Sidebar group entry (Lenses)
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 75 — Impact Analysis nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/ImpactAnalysisPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "impact-analysis" in the AgentStudioView union', () => {
      expect(/\|\s*"impact-analysis"/.test(src)).toBe(true);
    });

    it("Lenses sidebar group has an Impact Analysis entry", () => {
      const block = src.match(/label:\s*"Lenses"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /\{\s*key:\s*"impact-analysis",\s*label:\s*"Impact Analysis",\s*icon:\s*Network\s*\}/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports ImpactAnalysisPage", () => {
      expect(
        /const ImpactAnalysisPage = lazy\([\s\S]+?ImpactAnalysisPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/impact-analysis → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/impact-analysis"\)[\s\S]+?view:\s*"impact-analysis"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "impact-analysis"[\s\S]+?navigate\("\/agent-studio\/impact-analysis"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering ImpactAnalysisPage", () => {
      expect(
        /case\s+"impact-analysis":\s*\n?\s*return\s+<ImpactAnalysisPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("no `as any` casts on impact-analysis sites", () => {
      expect(/"impact-analysis"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
