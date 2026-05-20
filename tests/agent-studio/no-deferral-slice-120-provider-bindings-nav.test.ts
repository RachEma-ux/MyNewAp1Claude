/**
 * No-Deferral continuation-29 slice 120 — Provider Bindings Admin
 * nav-surface source-scan lockstep.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 120 — Provider Bindings Admin nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/ProviderBindingsAdminPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "provider-bindings-admin" in the AgentStudioView union', () => {
      expect(/\|\s*"provider-bindings-admin"/.test(src)).toBe(true);
    });

    it("Provider Bindings sidebar group has an Admin entry with Plug icon", () => {
      const block = src.match(/label:\s*"Provider Bindings"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /key:\s*"provider-bindings-admin",\s*label:\s*"Admin",\s*icon:\s*Plug/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports ProviderBindingsAdminPage", () => {
      expect(
        /const ProviderBindingsAdminPage = lazy\([\s\S]+?ProviderBindingsAdminPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/provider-bindings-admin → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/provider-bindings-admin"\)[\s\S]+?view:\s*"provider-bindings-admin"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "provider-bindings-admin"[\s\S]+?navigate\("\/agent-studio\/provider-bindings-admin"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering ProviderBindingsAdminPage", () => {
      expect(
        /case\s+"provider-bindings-admin":\s*\n?\s*return\s+<ProviderBindingsAdminPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("no `as any` casts on provider-bindings-admin sites", () => {
      expect(/"provider-bindings-admin"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
