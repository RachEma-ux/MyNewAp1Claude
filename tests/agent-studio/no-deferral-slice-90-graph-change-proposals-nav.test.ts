/**
 * No-Deferral continuation-19 slice 90 — Graph Change Proposals
 * lifecycle admin nav-surface source-scan lockstep. Per continuation-10
 * completion-audit lesson #1, asserts all 7 nav-surface items wired.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 90 — Graph Change Proposals nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/GraphChangeProposalsPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "graph-change-proposals" in the AgentStudioView union', () => {
      expect(/\|\s*"graph-change-proposals"/.test(src)).toBe(true);
    });

    it("imports Gavel from lucide-react", () => {
      expect(/Gavel,?\s*\n[\s\S]+?from\s+"lucide-react"/.test(src)).toBe(true);
    });

    it("Proposals sidebar group has a Graph Change Proposals entry with Gavel icon", () => {
      const block = src.match(/label:\s*"Proposals"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /key:\s*"graph-change-proposals",\s*label:\s*"Graph Change Proposals",\s*icon:\s*Gavel/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports GraphChangeProposalsPage", () => {
      expect(
        /const GraphChangeProposalsPage = lazy\([\s\S]+?GraphChangeProposalsPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/graph-change-proposals → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/graph-change-proposals"\)[\s\S]+?view:\s*"graph-change-proposals"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "graph-change-proposals"[\s\S]+?navigate\("\/agent-studio\/graph-change-proposals"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering GraphChangeProposalsPage", () => {
      expect(
        /case\s+"graph-change-proposals":\s*\n?\s*return\s+<GraphChangeProposalsPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("no `as any` casts on graph-change-proposals sites", () => {
      expect(/"graph-change-proposals"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
