/**
 * No-Deferral continuation-23 slice 102 — Promotion Lifecycle admin
 * nav-surface source-scan lockstep. Per continuation-10 completion-
 * audit lesson #1, asserts all 7 nav-surface items wired.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 102 — Promotion Lifecycle nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/PromotionLifecyclePage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "promotion-lifecycle" in the AgentStudioView union', () => {
      expect(/\|\s*"promotion-lifecycle"/.test(src)).toBe(true);
    });

    it("Promotion sidebar group has a Lifecycle entry with GitBranch icon", () => {
      const block = src.match(/label:\s*"Promotion"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /key:\s*"promotion-lifecycle",\s*label:\s*"Lifecycle",\s*icon:\s*GitBranch/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports PromotionLifecyclePage", () => {
      expect(
        /const PromotionLifecyclePage = lazy\([\s\S]+?PromotionLifecyclePage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/promotion-lifecycle → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/promotion-lifecycle"\)[\s\S]+?view:\s*"promotion-lifecycle"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "promotion-lifecycle"[\s\S]+?navigate\("\/agent-studio\/promotion-lifecycle"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering PromotionLifecyclePage", () => {
      expect(
        /case\s+"promotion-lifecycle":\s*\n?\s*return\s+<PromotionLifecyclePage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("no `as any` casts on promotion-lifecycle sites", () => {
      expect(/"promotion-lifecycle"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
