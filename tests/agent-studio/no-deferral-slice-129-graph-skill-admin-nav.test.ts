/**
 * No-Deferral continuation-32 slice 129 — Graph Skill Admin nav-surface
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

describe("slice 129 — Graph Skill Admin nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/GraphSkillAdminPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  it("Panel file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/components/GraphSkillAdminPanel.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "graph-skill-admin" in the AgentStudioView union', () => {
      expect(/\|\s*"graph-skill-admin"/.test(src)).toBe(true);
    });

    it("Graph Skills sidebar group has a Pack Admin entry with FileStack icon", () => {
      const block = src.match(/label:\s*"Graph Skills"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /key:\s*"graph-skill-admin",\s*label:\s*"Pack Admin",\s*icon:\s*FileStack/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports GraphSkillAdminPage", () => {
      expect(
        /const GraphSkillAdminPage = lazy\([\s\S]+?GraphSkillAdminPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/graph-skill-admin → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/graph-skill-admin"\)[\s\S]+?view:\s*"graph-skill-admin"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "graph-skill-admin"[\s\S]+?navigate\("\/agent-studio\/graph-skill-admin"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering GraphSkillAdminPage", () => {
      expect(
        /case\s+"graph-skill-admin":\s*\n?\s*return\s+<GraphSkillAdminPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("no `as any` casts on graph-skill-admin sites", () => {
      expect(/"graph-skill-admin"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
