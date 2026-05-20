/**
 * No-Deferral continuation-25 slice 108 — Semantic Enrichment admin
 * nav-surface source-scan lockstep.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 108 — Semantic Enrichment nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/SemanticEnrichmentPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "semantic-enrichment" in the AgentStudioView union', () => {
      expect(/\|\s*"semantic-enrichment"/.test(src)).toBe(true);
    });

    it("Semantic Enrichment sidebar group has a Runs entry with Sparkles icon", () => {
      const block = src.match(/label:\s*"Semantic Enrichment"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /key:\s*"semantic-enrichment",\s*label:\s*"Runs",\s*icon:\s*Sparkles/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports SemanticEnrichmentPage", () => {
      expect(
        /const SemanticEnrichmentPage = lazy\([\s\S]+?SemanticEnrichmentPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/semantic-enrichment → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/semantic-enrichment"\)[\s\S]+?view:\s*"semantic-enrichment"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "semantic-enrichment"[\s\S]+?navigate\("\/agent-studio\/semantic-enrichment"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering SemanticEnrichmentPage", () => {
      expect(
        /case\s+"semantic-enrichment":\s*\n?\s*return\s+<SemanticEnrichmentPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("no `as any` casts on semantic-enrichment sites", () => {
      expect(/"semantic-enrichment"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
