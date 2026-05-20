/**
 * No-Deferral continuation-24 slice 105 — Graph Correction admin
 * nav-surface source-scan lockstep.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 105 — Graph Correction nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/GraphCorrectionPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "graph-correction" in the AgentStudioView union', () => {
      expect(/\|\s*"graph-correction"/.test(src)).toBe(true);
    });

    it("Graph Correction sidebar group has a Proposals entry with ShieldAlert icon", () => {
      const block = src.match(/label:\s*"Graph Correction"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /key:\s*"graph-correction",\s*label:\s*"Proposals",\s*icon:\s*ShieldAlert/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports GraphCorrectionPage", () => {
      expect(
        /const GraphCorrectionPage = lazy\([\s\S]+?GraphCorrectionPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/graph-correction → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/graph-correction"\)[\s\S]+?view:\s*"graph-correction"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "graph-correction"[\s\S]+?navigate\("\/agent-studio\/graph-correction"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering GraphCorrectionPage", () => {
      expect(
        /case\s+"graph-correction":\s*\n?\s*return\s+<GraphCorrectionPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("no `as any` casts on graph-correction sites", () => {
      expect(/"graph-correction"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
