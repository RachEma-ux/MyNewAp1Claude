/**
 * Catalog Tools nav-surface source-scan lockstep — Phase 13e
 * back-fill (post no-deferral cycle close 2026-05-20).
 *
 * Sibling of `catalog-skills-nav.test.ts`. Guards `/agent-studio/catalog/tools`
 * wiring.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("Catalog Tools nav surface (Phase 13e)", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/AgentToolCatalogPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "catalog-tools" in the AgentStudioView union', () => {
      expect(/\|\s*"catalog-tools"/.test(src)).toBe(true);
    });

    it("Catalog sidebar group has a Tools Catalog entry", () => {
      const block = src.match(/label:\s*"Catalog"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /key:\s*"catalog-tools",\s*label:\s*"Tools Catalog",\s*icon:\s*Wrench/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports AgentToolCatalogPage", () => {
      expect(
        /const AgentToolCatalogPage = lazy\([\s\S]+?AgentToolCatalogPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/catalog/tools → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/catalog\/tools"\)[\s\S]+?view:\s*"catalog-tools"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "catalog-tools"[\s\S]+?navigate\("\/agent-studio\/catalog\/tools"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering AgentToolCatalogPage", () => {
      expect(
        /case\s+"catalog-tools"[\s\S]+?return\s+<AgentToolCatalogPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });
  });
});
