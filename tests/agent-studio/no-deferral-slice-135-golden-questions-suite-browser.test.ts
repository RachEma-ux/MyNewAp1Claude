/**
 * No-Deferral continuation-34 slice 135 — GoldenQuestionsSuiteBrowserPanel
 * source-scan lockstep. Asserts the new panel exists and is rendered
 * in the existing GoldenQuestionsPage alongside the trigger and
 * recent-runs panels.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 135 — Golden Questions suite browser", () => {
  it("Panel file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/components/GoldenQuestionsSuiteBrowserPanel.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("GoldenQuestionsSuiteBrowserPanel.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/GoldenQuestionsSuiteBrowserPanel.tsx",
    );

    it("calls trpc.agentStudio.goldenQuestions.listQuestionsInSuite", () => {
      expect(
        /trpc\.agentStudio\.goldenQuestions\.listQuestionsInSuite\.useQuery/.test(
          src,
        ),
      ).toBe(true);
    });

    it("calls trpc.agentStudio.goldenQuestions.listSuites for the dropdown", () => {
      expect(
        /trpc\.agentStudio\.goldenQuestions\.listSuites\.useQuery/.test(src),
      ).toBe(true);
    });

    it("handles the discriminated envelope (ok / not_found)", () => {
      expect(/status:\s*"ok"/.test(src)).toBe(true);
      expect(/status:\s*"not_found"/.test(src)).toBe(true);
    });

    it("exports GoldenQuestionsSuiteBrowserPanel", () => {
      expect(/export function GoldenQuestionsSuiteBrowserPanel/.test(src)).toBe(
        true,
      );
    });
  });

  describe("GoldenQuestionsPage.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/pages/GoldenQuestionsPage.tsx",
    );

    it("imports GoldenQuestionsSuiteBrowserPanel", () => {
      expect(
        /import\s+\{\s*GoldenQuestionsSuiteBrowserPanel\s*\}\s+from/.test(src),
      ).toBe(true);
    });

    it("renders GoldenQuestionsSuiteBrowserPanel inside the page", () => {
      expect(/<GoldenQuestionsSuiteBrowserPanel\s*\/>/.test(src)).toBe(true);
    });

    it("preserves the existing trigger panel render", () => {
      expect(/<GoldenQuestionsTriggerPanel\s*\/>/.test(src)).toBe(true);
    });

    it("preserves the existing recent-runs panel render", () => {
      expect(/<GoldenQuestionsRecentRunsPanel\s*\/>/.test(src)).toBe(true);
    });
  });
});
