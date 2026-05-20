/**
 * No-Deferral continuation-18 slice 87 — Code Graph admin nav-surface
 * source-scan lockstep. Per continuation-10 completion-audit lesson #1,
 * asserts all 7 nav-surface items wired.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 87 — Code Graph nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/CodeGraphPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "code-graph" in the AgentStudioView union', () => {
      expect(/\|\s*"code-graph"/.test(src)).toBe(true);
    });

    it("Lenses sidebar group has a Code Graph entry with ScanSearch icon", () => {
      const block = src.match(/label:\s*"Lenses"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /\{\s*key:\s*"code-graph",\s*label:\s*"Code Graph",\s*icon:\s*ScanSearch\s*\}/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports CodeGraphPage", () => {
      expect(
        /const CodeGraphPage = lazy\([\s\S]+?CodeGraphPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/code-graph → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/code-graph"\)[\s\S]+?view:\s*"code-graph"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "code-graph"[\s\S]+?navigate\("\/agent-studio\/code-graph"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering CodeGraphPage", () => {
      expect(
        /case\s+"code-graph":\s*\n?\s*return\s+<CodeGraphPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("no `as any` casts on code-graph sites", () => {
      expect(/"code-graph"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
