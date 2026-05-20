/**
 * No-Deferral continuation-36 slice 141 — RacEvaluateTracePanel
 * source-scan lockstep.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 141 — RacEvaluateTracePanel", () => {
  it("Panel file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/components/RacEvaluateTracePanel.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("RacEvaluateTracePanel.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/RacEvaluateTracePanel.tsx",
    );

    it("calls trpc.agentStudio.racEvaluation.evaluate mutation", () => {
      expect(
        /trpc\.agentStudio\.racEvaluation\.evaluate\.useMutation/.test(src),
      ).toBe(true);
    });

    it("renders groundedness / relevance / citationCoverage scores", () => {
      expect(/groundedness\.score/.test(src)).toBe(true);
      expect(/relevance\.score/.test(src)).toBe(true);
      expect(/citationCoverage\.coverage/.test(src)).toBe(true);
    });

    it("exports RacEvaluateTracePanel", () => {
      expect(/export function RacEvaluateTracePanel/.test(src)).toBe(true);
    });
  });

  describe("RacPage.tsx", () => {
    const src = read("client/src/modules/agent-studio/pages/RacPage.tsx");

    it("imports RacEvaluateTracePanel", () => {
      expect(
        /import\s+\{\s*RacEvaluateTracePanel\s*\}\s+from/.test(src),
      ).toBe(true);
    });

    it("renders RacEvaluateTracePanel inside the evaluation tab", () => {
      expect(
        /<RacEvaluateTracePanel\s+workspaceId=\{workspaceId\}\s*\/>/.test(src),
      ).toBe(true);
    });

    it("preserves the existing RacEvaluationPanel render", () => {
      expect(/<RacEvaluationPanel/.test(src)).toBe(true);
    });
  });
});
