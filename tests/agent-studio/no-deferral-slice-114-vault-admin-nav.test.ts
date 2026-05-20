/**
 * No-Deferral continuation-27 slice 114 — Vault Admin nav-surface
 * source-scan lockstep.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 114 — Vault Admin nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/VaultAdminPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "vault-admin" in the AgentStudioView union', () => {
      expect(/\|\s*"vault-admin"/.test(src)).toBe(true);
    });

    it("Vault Admin sidebar group has an Operator entry with BookOpen icon", () => {
      const block = src.match(/label:\s*"Vault Admin"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /key:\s*"vault-admin",\s*label:\s*"Operator",\s*icon:\s*BookOpen/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports VaultAdminPage", () => {
      expect(
        /const VaultAdminPage = lazy\([\s\S]+?VaultAdminPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/vault-admin → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/vault-admin"\)[\s\S]+?view:\s*"vault-admin"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "vault-admin"[\s\S]+?navigate\("\/agent-studio\/vault-admin"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering VaultAdminPage", () => {
      expect(
        /case\s+"vault-admin":\s*\n?\s*return\s+<VaultAdminPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("no `as any` casts on vault-admin sites", () => {
      expect(/"vault-admin"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
