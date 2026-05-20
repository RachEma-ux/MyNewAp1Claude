/**
 * No-Deferral continuation-39 slice 150 — Graph Workspace Admin
 * nav-surface source-scan lockstep. FINAL arc of the
 * partial-consumer audit cycle.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 150 — Graph Workspace Admin nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/GraphWorkspaceAdminPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  it("Panel file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/components/GraphWorkspaceUtilsPanel.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("GraphWorkspaceUtilsPanel.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/GraphWorkspaceUtilsPanel.tsx",
    );

    it("calls graphWorkspace.backendHealth", () => {
      expect(
        /trpc\.agentStudio\.graphWorkspace\.backendHealth\.useQuery/.test(src),
      ).toBe(true);
    });

    it("calls graphWorkspace.neighborhood", () => {
      expect(
        /trpc\.agentStudio\.graphWorkspace\.neighborhood\.useQuery/.test(src),
      ).toBe(true);
    });

    it("calls graphWorkspace.shortestPath", () => {
      expect(
        /trpc\.agentStudio\.graphWorkspace\.shortestPath\.useQuery/.test(src),
      ).toBe(true);
    });
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "graph-workspace-admin" in the AgentStudioView union', () => {
      expect(/\|\s*"graph-workspace-admin"/.test(src)).toBe(true);
    });

    it("Graph Utilities sidebar group has a Backend Probes entry with Telescope icon", () => {
      const block = src.match(/label:\s*"Graph Utilities"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /key:\s*"graph-workspace-admin",\s*label:\s*"Backend Probes",\s*icon:\s*Telescope/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports GraphWorkspaceAdminPage", () => {
      expect(
        /const GraphWorkspaceAdminPage = lazy\([\s\S]+?GraphWorkspaceAdminPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/graph-workspace-admin → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/graph-workspace-admin"\)[\s\S]+?view:\s*"graph-workspace-admin"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "graph-workspace-admin"[\s\S]+?navigate\("\/agent-studio\/graph-workspace-admin"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering GraphWorkspaceAdminPage", () => {
      expect(
        /case\s+"graph-workspace-admin":\s*\n?\s*return\s+<GraphWorkspaceAdminPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("no `as any` casts on graph-workspace-admin sites", () => {
      expect(/"graph-workspace-admin"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
