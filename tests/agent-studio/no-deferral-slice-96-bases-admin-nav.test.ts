/**
 * No-Deferral continuation-21 slice 96 — Bases Admin canonical-CRUD
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

describe("slice 96 — Bases Admin canonical-CRUD nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/BasesAdminPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "bases-admin" in the AgentStudioView union', () => {
      expect(/\|\s*"bases-admin"/.test(src)).toBe(true);
    });

    it("Bases (canonical) sidebar group has a Bases Admin entry with Table2 icon", () => {
      const block = src.match(/label:\s*"Bases \(canonical\)"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /key:\s*"bases-admin",\s*label:\s*"Bases Admin",\s*icon:\s*Table2/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports BasesAdminPage", () => {
      expect(
        /const BasesAdminPage = lazy\([\s\S]+?BasesAdminPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/bases-admin → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/bases-admin"\)[\s\S]+?view:\s*"bases-admin"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "bases-admin"[\s\S]+?navigate\("\/agent-studio\/bases-admin"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering BasesAdminPage", () => {
      expect(
        /case\s+"bases-admin":\s*\n?\s*return\s+<BasesAdminPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("no `as any` casts on bases-admin sites", () => {
      expect(/"bases-admin"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
