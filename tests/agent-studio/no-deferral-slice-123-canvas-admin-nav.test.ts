/**
 * No-Deferral continuation-30 slice 123 — Canvas Admin nav-surface
 * source-scan lockstep.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 123 — Canvas Admin nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/CanvasAdminPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "canvas-admin" in the AgentStudioView union', () => {
      expect(/\|\s*"canvas-admin"/.test(src)).toBe(true);
    });

    it("Canvas Admin sidebar group has a Write Surface entry with LayoutGrid icon", () => {
      const block = src.match(/label:\s*"Canvas Admin"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /key:\s*"canvas-admin",\s*label:\s*"Write Surface",\s*icon:\s*LayoutGrid/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports CanvasAdminPage", () => {
      expect(
        /const CanvasAdminPage = lazy\([\s\S]+?CanvasAdminPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/canvas-admin → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/canvas-admin"\)[\s\S]+?view:\s*"canvas-admin"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "canvas-admin"[\s\S]+?navigate\("\/agent-studio\/canvas-admin"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering CanvasAdminPage", () => {
      expect(
        /case\s+"canvas-admin":\s*\n?\s*return\s+<CanvasAdminPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("no `as any` casts on canvas-admin sites", () => {
      expect(/"canvas-admin"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
