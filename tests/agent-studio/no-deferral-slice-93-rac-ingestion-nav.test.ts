/**
 * No-Deferral continuation-20 slice 93 — RAC Ingestion admin nav-surface
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

describe("slice 93 — RAC Ingestion nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/RacIngestionPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "rac-ingestion" in the AgentStudioView union', () => {
      expect(/\|\s*"rac-ingestion"/.test(src)).toBe(true);
    });

    it("RAC sidebar group has an Ingestion entry with Database icon", () => {
      const block = src.match(/label:\s*"RAC"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /key:\s*"rac-ingestion",\s*label:\s*"Ingestion",\s*icon:\s*Database/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports RacIngestionPage", () => {
      expect(
        /const RacIngestionPage = lazy\([\s\S]+?RacIngestionPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/rac-ingestion → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/rac-ingestion"\)[\s\S]+?view:\s*"rac-ingestion"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "rac-ingestion"[\s\S]+?navigate\("\/agent-studio\/rac-ingestion"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering RacIngestionPage", () => {
      expect(
        /case\s+"rac-ingestion":\s*\n?\s*return\s+<RacIngestionPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("no `as any` casts on rac-ingestion sites", () => {
      expect(/"rac-ingestion"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
