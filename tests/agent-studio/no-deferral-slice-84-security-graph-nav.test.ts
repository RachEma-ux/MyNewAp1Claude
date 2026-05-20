/**
 * No-Deferral continuation-17 slice 84 — Security Graph admin
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

describe("slice 84 — Security Graph nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/SecurityGraphPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "security-graph" in the AgentStudioView union', () => {
      expect(/\|\s*"security-graph"/.test(src)).toBe(true);
    });

    it("Lenses sidebar group has a Security Graph entry with ShieldAlert icon", () => {
      const block = src.match(/label:\s*"Lenses"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /\{\s*key:\s*"security-graph",\s*label:\s*"Security Graph",\s*icon:\s*ShieldAlert\s*\}/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports SecurityGraphPage", () => {
      expect(
        /const SecurityGraphPage = lazy\([\s\S]+?SecurityGraphPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/security-graph → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/security-graph"\)[\s\S]+?view:\s*"security-graph"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "security-graph"[\s\S]+?navigate\("\/agent-studio\/security-graph"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering SecurityGraphPage", () => {
      expect(
        /case\s+"security-graph":\s*\n?\s*return\s+<SecurityGraphPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("no `as any` casts on security-graph sites", () => {
      expect(/"security-graph"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
