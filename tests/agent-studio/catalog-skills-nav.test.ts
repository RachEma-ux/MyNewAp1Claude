/**
 * Catalog Skills nav-surface source-scan lockstep — Phase 13e
 * back-fill (post no-deferral cycle close 2026-05-20).
 *
 * Guards against the silent-drift regression where `/agent-studio/catalog/skills`
 * resolves to a different view than the sidebar's "Skills Catalog"
 * entry points to. The page + Shell wiring has been live since
 * Phase 13e but lacked a lockstep test; this back-fill plus the
 * sibling `catalog-tools-nav.test.ts` + `marketplace-nav.test.ts`
 * codifies the same nav-surface invariants the no-deferral cycle
 * (cont-23..39) established for newer admin pages.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("Catalog Skills nav surface (Phase 13e)", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/AgentSkillCatalogPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "catalog-skills" in the AgentStudioView union', () => {
      expect(/\|\s*"catalog-skills"/.test(src)).toBe(true);
    });

    it("Catalog sidebar group has a Skills Catalog entry", () => {
      const block = src.match(/label:\s*"Catalog"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /key:\s*"catalog-skills",\s*label:\s*"Skills Catalog",\s*icon:\s*Library/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports AgentSkillCatalogPage", () => {
      expect(
        /const AgentSkillCatalogPage = lazy\([\s\S]+?AgentSkillCatalogPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/catalog/skills → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/catalog\/skills"\)[\s\S]+?view:\s*"catalog-skills"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "catalog-skills"[\s\S]+?navigate\("\/agent-studio\/catalog\/skills"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering AgentSkillCatalogPage", () => {
      expect(
        /case\s+"catalog-skills"[\s\S]+?return\s+<AgentSkillCatalogPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });
  });
});
