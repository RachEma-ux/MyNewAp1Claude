/**
 * No-Deferral continuation-31 slice 126 — Graph Agent Admin nav-surface
 * source-scan lockstep.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 126 — Graph Agent Admin nav surface", () => {
  it("Page file exists", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/GraphAgentAdminPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );
    it('includes "graph-agent-admin" in the union', () => {
      expect(/\|\s*"graph-agent-admin"/.test(src)).toBe(true);
    });
    it("Graph Agent sidebar group has a Run + Export entry with Brain icon", () => {
      const block = src.match(/label:\s*"Graph Agent"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /key:\s*"graph-agent-admin",\s*label:\s*"Run \+ Export",\s*icon:\s*Brain/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );
    it("lazy-imports GraphAgentAdminPage", () => {
      expect(
        /const GraphAgentAdminPage = lazy\([\s\S]+?GraphAgentAdminPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });
    it("path resolver maps /agent-studio/graph-agent-admin → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/graph-agent-admin"\)[\s\S]+?view:\s*"graph-agent-admin"/.test(
          src,
        ),
      ).toBe(true);
    });
    it("nav-key dispatcher navigates", () => {
      expect(
        /key === "graph-agent-admin"[\s\S]+?navigate\("\/agent-studio\/graph-agent-admin"\)/.test(
          src,
        ),
      ).toBe(true);
    });
    it("view switch renders GraphAgentAdminPage", () => {
      expect(
        /case\s+"graph-agent-admin":\s*\n?\s*return\s+<GraphAgentAdminPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });
    it("no `as any` casts", () => {
      expect(/"graph-agent-admin"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
