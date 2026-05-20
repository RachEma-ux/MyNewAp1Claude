/**
 * No-Deferral continuation-26 slice 111 — Graph Quality admin
 * nav-surface source-scan lockstep.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 111 — Graph Quality nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/GraphQualityPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "graph-quality" in the AgentStudioView union', () => {
      expect(/\|\s*"graph-quality"\s*\n/.test(src)).toBe(true);
    });

    it("Graph Quality sidebar group has a Quality Admin entry with Award icon", () => {
      const block = src.match(/label:\s*"Graph Quality"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /key:\s*"graph-quality",\s*label:\s*"Quality Admin",\s*icon:\s*Award/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports GraphQualityPage", () => {
      expect(
        /const GraphQualityPage = lazy\([\s\S]+?GraphQualityPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/graph-quality (exact-or-trailing-slash) → view", () => {
      // Must use exact-match OR trailing-slash startsWith to avoid
      // shadowing /agent-studio/graph-quality-findings.
      expect(
        /path === "\/agent-studio\/graph-quality"[\s\S]+?view:\s*"graph-quality"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "graph-quality"\s*\)[\s\S]+?navigate\("\/agent-studio\/graph-quality"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering GraphQualityPage", () => {
      expect(
        /case\s+"graph-quality":\s*\n?\s*return\s+<GraphQualityPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("no `as any` casts on graph-quality sites", () => {
      expect(/"graph-quality"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
