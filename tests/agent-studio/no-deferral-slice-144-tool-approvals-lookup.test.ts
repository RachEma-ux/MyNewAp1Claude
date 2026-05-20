/**
 * No-Deferral continuation-37 slice 144 — ToolApprovalsLookupPanel
 * source-scan lockstep.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 144 — ToolApprovalsLookupPanel", () => {
  it("Panel file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/components/ToolApprovalsLookupPanel.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("ToolApprovalsLookupPanel.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/ToolApprovalsLookupPanel.tsx",
    );

    it("calls trpc.agentStudio.toolApprovals.list", () => {
      expect(/trpc\.agentStudio\.toolApprovals\.list\.useQuery/.test(src)).toBe(
        true,
      );
    });

    it("calls trpc.agentStudio.toolApprovals.getByHash", () => {
      expect(
        /trpc\.agentStudio\.toolApprovals\.getByHash\.useQuery/.test(src),
      ).toBe(true);
    });

    it("validates the proposedToolCallHash regex (64 hex chars)", () => {
      expect(/\/\^\[0-9a-f\]\{64\}\$\//.test(src)).toBe(true);
    });

    it("exports ToolApprovalsLookupPanel", () => {
      expect(/export function ToolApprovalsLookupPanel/.test(src)).toBe(true);
    });
  });

  describe("RetrofitPage.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/pages/RetrofitPage.tsx",
    );

    it("imports ToolApprovalsLookupPanel", () => {
      expect(
        /import\s+\{\s*ToolApprovalsLookupPanel\s*\}\s+from/.test(src),
      ).toBe(true);
    });

    it("renders ToolApprovalsLookupPanel inside the approvals tab", () => {
      expect(
        /<ToolApprovalsLookupPanel\s+agentDraftId=\{draftId\}\s*\/>/.test(src),
      ).toBe(true);
    });

    it("preserves the existing ApprovalsPanel render", () => {
      expect(/<ApprovalsPanel\s+agentDraftId=\{draftId\}\s*\/>/.test(src)).toBe(
        true,
      );
    });
  });
});
