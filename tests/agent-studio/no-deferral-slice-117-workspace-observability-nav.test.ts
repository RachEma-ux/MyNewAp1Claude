/**
 * No-Deferral continuation-28 slice 117 — Workspace Observability
 * nav-surface source-scan lockstep.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 117 — Workspace Observability nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/WorkspaceObservabilityPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "workspace-observability" in the AgentStudioView union', () => {
      expect(/\|\s*"workspace-observability"/.test(src)).toBe(true);
    });

    it("Observability sidebar group has a Notifications + Jobs entry with Activity icon", () => {
      const block = src.match(/label:\s*"Observability"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /key:\s*"workspace-observability",\s*label:\s*"Notifications \+ Jobs",\s*icon:\s*Activity/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports WorkspaceObservabilityPage", () => {
      expect(
        /const WorkspaceObservabilityPage = lazy\([\s\S]+?WorkspaceObservabilityPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/workspace-observability → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/workspace-observability"\)[\s\S]+?view:\s*"workspace-observability"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "workspace-observability"[\s\S]+?navigate\("\/agent-studio\/workspace-observability"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering WorkspaceObservabilityPage", () => {
      expect(
        /case\s+"workspace-observability":\s*\n?\s*return\s+<WorkspaceObservabilityPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("no `as any` casts on workspace-observability sites", () => {
      expect(/"workspace-observability"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
