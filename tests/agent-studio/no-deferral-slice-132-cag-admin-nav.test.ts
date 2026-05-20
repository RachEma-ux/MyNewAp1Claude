/**
 * No-Deferral continuation-33 slice 132 — CAG Admin nav-surface
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

describe("slice 132 — CAG Admin nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/CagAdminPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  it("Panel file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/components/CagAdminPanel.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "cag-admin" in the AgentStudioView union', () => {
      expect(/\|\s*"cag-admin"/.test(src)).toBe(true);
    });

    it("CAG sidebar group has a Pack Admin entry with Database icon", () => {
      const block = src.match(/label:\s*"CAG"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /key:\s*"cag-admin",\s*label:\s*"Pack Admin",\s*icon:\s*Database/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports CagAdminPage", () => {
      expect(
        /const CagAdminPage = lazy\([\s\S]+?CagAdminPage[\s\S]+?\)/.test(src),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/cag-admin → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/cag-admin"\)[\s\S]+?view:\s*"cag-admin"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "cag-admin"[\s\S]+?navigate\("\/agent-studio\/cag-admin"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering CagAdminPage", () => {
      expect(
        /case\s+"cag-admin":\s*\n?\s*return\s+<CagAdminPage\s*\/>/.test(src),
      ).toBe(true);
    });

    it("no `as any` casts on cag-admin sites", () => {
      expect(/"cag-admin"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
