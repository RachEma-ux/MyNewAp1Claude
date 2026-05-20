/**
 * Marketplace nav-surface source-scan lockstep — Phase 14c
 * back-fill (post no-deferral cycle close 2026-05-20).
 *
 * Sibling of `catalog-{skills,tools}-nav.test.ts`. Guards
 * `/agent-studio/marketplace` wiring.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("Marketplace nav surface (Phase 14c)", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/AgentMarketplacePage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "marketplace" in the AgentStudioView union', () => {
      expect(/\|\s*"marketplace"/.test(src)).toBe(true);
    });

    it("Marketplace sidebar group has a Browse / Install entry", () => {
      const block = src.match(/label:\s*"Marketplace"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /key:\s*"marketplace",\s*label:\s*"Browse \/ Install",\s*icon:\s*Store/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports AgentMarketplacePage", () => {
      expect(
        /const AgentMarketplacePage = lazy\([\s\S]+?AgentMarketplacePage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/marketplace → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/marketplace"\)[\s\S]+?view:\s*"marketplace"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "marketplace"[\s\S]+?navigate\("\/agent-studio\/marketplace"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering AgentMarketplacePage", () => {
      expect(
        /case\s+"marketplace"[\s\S]+?return\s+<AgentMarketplacePage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });
  });
});
