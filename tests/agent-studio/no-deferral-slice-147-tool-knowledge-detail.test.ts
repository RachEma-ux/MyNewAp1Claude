/**
 * No-Deferral continuation-38 slice 147 — ToolKnowledgeDetailPanel
 * source-scan lockstep.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 147 — ToolKnowledgeDetailPanel", () => {
  it("Panel file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/components/ToolKnowledgeDetailPanel.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("ToolKnowledgeDetailPanel.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/ToolKnowledgeDetailPanel.tsx",
    );

    it("calls trpc.agentStudio.toolKnowledge.getTool", () => {
      expect(
        /trpc\.agentStudio\.toolKnowledge\.getTool\.useQuery/.test(src),
      ).toBe(true);
    });

    it("disables retry on the query (NOT_FOUND should not retry)", () => {
      expect(/retry:\s*false/.test(src)).toBe(true);
    });

    it("exports ToolKnowledgeDetailPanel", () => {
      expect(/export function ToolKnowledgeDetailPanel/.test(src)).toBe(true);
    });
  });

  describe("RetrofitPage.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/pages/RetrofitPage.tsx",
    );

    it("imports ToolKnowledgeDetailPanel", () => {
      expect(
        /import\s+\{\s*ToolKnowledgeDetailPanel\s*\}\s+from/.test(src),
      ).toBe(true);
    });

    it("renders ToolKnowledgeDetailPanel inside the tool-knowledge tab", () => {
      expect(
        /<ToolKnowledgeDetailPanel\s+workspaceId=\{workspaceId\}\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("preserves the existing ToolKnowledgePanel render", () => {
      expect(
        /<ToolKnowledgePanel\s+workspaceId=\{workspaceId\}\s*\/>/.test(src),
      ).toBe(true);
    });
  });
});
