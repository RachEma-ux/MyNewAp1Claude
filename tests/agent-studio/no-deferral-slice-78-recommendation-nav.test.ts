/**
 * No-Deferral continuation-15 slice 78 — Recommendation admin
 * surface source-scan lockstep. Per continuation-10 completion-
 * audit lesson #1, asserts all 7 nav-surface items wired.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 78 — Recommendation nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/RecommendationPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "recommendation" in the AgentStudioView union', () => {
      expect(/\|\s*"recommendation"/.test(src)).toBe(true);
    });

    it("imports Sparkles icon", () => {
      expect(/\bSparkles,?\s*\n/.test(src)).toBe(true);
    });

    it("Lenses sidebar group has a Recommendation entry", () => {
      const block = src.match(/label:\s*"Lenses"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /\{\s*key:\s*"recommendation",\s*label:\s*"Recommendation",\s*icon:\s*Sparkles\s*\}/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports RecommendationPage", () => {
      expect(
        /const RecommendationPage = lazy\([\s\S]+?RecommendationPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/recommendation → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/recommendation"\)[\s\S]+?view:\s*"recommendation"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "recommendation"[\s\S]+?navigate\("\/agent-studio\/recommendation"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering RecommendationPage", () => {
      expect(
        /case\s+"recommendation":\s*\n?\s*return\s+<RecommendationPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("no `as any` casts on recommendation sites", () => {
      expect(/"recommendation"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
