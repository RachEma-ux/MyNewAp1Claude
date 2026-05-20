/**
 * No-Deferral continuation-12 slice 69 — Golden Questions admin
 * surface source-scan lockstep.
 *
 * Per continuation-10 completion-audit lesson #1 ("ship all 7 nav-
 * surface items in one slice"), this pin asserts the page is
 * wired into every one of:
 *   1. Page file
 *   2. Lazy import in AgentStudioShell
 *   3. Route resolution (`/agent-studio/golden-questions`)
 *   4. View switch case
 *   5. Navigation-key dispatch
 *   6. `AgentStudioView` discriminated-union entry
 *   7. Sidebar group entry (Evaluation)
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 69 — Golden Questions nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/GoldenQuestionsPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "golden-questions" in the AgentStudioView union', () => {
      expect(/\|\s*"golden-questions"/.test(src)).toBe(true);
    });

    it("imports Award icon", () => {
      expect(/\bAward,?\s*\n/.test(src)).toBe(true);
    });

    it("has an Evaluation sidebar group with Golden Questions entry", () => {
      // Find the Evaluation group block and verify the entry.
      const block = src.match(/label:\s*"Evaluation"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /\{\s*key:\s*"golden-questions",\s*label:\s*"Golden Questions",\s*icon:\s*Award\s*\}/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports GoldenQuestionsPage", () => {
      expect(
        /const GoldenQuestionsPage = lazy\([\s\S]+?GoldenQuestionsPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/golden-questions → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/golden-questions"\)[\s\S]+?view:\s*"golden-questions"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "golden-questions"[\s\S]+?navigate\("\/agent-studio\/golden-questions"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering GoldenQuestionsPage", () => {
      expect(
        /case\s+"golden-questions":\s*\n?\s*return\s+<GoldenQuestionsPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("no `as any` casts on golden-questions sites", () => {
      expect(/"golden-questions"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
