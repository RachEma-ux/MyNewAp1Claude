/**
 * No-Deferral continuation-10 slice 63 — VaultTemplates nav wiring
 * source-scan lockstep.
 *
 * Closes the slice-53 follow-on: VaultTemplatesPage was wired into
 * the URL resolver + view switch but was missing from the
 * `AgentStudioView` discriminated union + the Vaults sidebar group.
 * This pin catches future regressions if either nav surface drifts.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 63 — vault-templates nav wiring", () => {
  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "vault-templates" in the AgentStudioView discriminated union', () => {
      // Pin: the union variant must be a quoted string literal in
      // the type declaration, not just a runtime reference.
      expect(/\|\s*"vault-templates"/.test(src)).toBe(true);
    });

    it("imports FileText from lucide-react for the Templates entry icon", () => {
      expect(/\bFileText,?\s*\n/.test(src)).toBe(true);
    });

    it("Vaults sidebar group has a Templates entry pointing at vault-templates", () => {
      // The Vaults group is anchored by `label: "Vaults"`. Slice
      // 63 adds a third item after Attachments + Saved Views.
      const vaultsBlock = src.match(/label:\s*"Vaults"[\s\S]+?\]/);
      expect(vaultsBlock).not.toBeNull();
      const body = vaultsBlock?.[0] ?? "";
      expect(
        /\{\s*key:\s*"vault-templates",\s*label:\s*"Templates",\s*icon:\s*FileText\s*\}/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx — type-safe vault-templates refs", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("path resolver no longer casts vault-templates view as any", () => {
      expect(
        /view:\s*"vault-templates"\s*as\s*any/.test(src),
      ).toBe(false);
      expect(
        /view:\s*"vault-templates",/.test(src),
      ).toBe(true);
    });

    it("nav-key dispatch is no longer string-cast", () => {
      expect(
        /\(key as string\)\s*===\s*"vault-templates"/.test(src),
      ).toBe(false);
      expect(/\bkey === "vault-templates"/.test(src)).toBe(true);
    });

    it("view switch case is no longer cast as any", () => {
      expect(
        /case\s+"vault-templates"\s+as\s+any/.test(src),
      ).toBe(false);
      expect(/case\s+"vault-templates":/.test(src)).toBe(true);
    });
  });
});
