/**
 * VaultSavedViewsPage Shell + Sidebar wiring source-scan —
 * V1+ 16-δ slice (PR-V1-85).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("AgentStudioShell — vault-saved-views wiring", () => {
  const file = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/AgentStudioShell.tsx",
  );
  const src = readFileSync(file, "utf8");

  it("declares the lazy VaultSavedViewsPage import", () => {
    expect(
      /const\s+VaultSavedViewsPage\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*["']\.\.\/pages\/VaultSavedViewsPage["']\s*\)\s*\)/.test(
        src,
      ),
    ).toBe(true);
  });

  it("URL parser matches /agent-studio/vault-saved-views → view='vault-saved-views'", () => {
    expect(
      /path\.startsWith\(\s*["']\/agent-studio\/vault-saved-views["']\s*\)/.test(
        src,
      ),
    ).toBe(true);
    expect(/view:\s*["']vault-saved-views["']/.test(src)).toBe(true);
  });

  it("global-view switch renders <VaultSavedViewsPage /> for case 'vault-saved-views'", () => {
    expect(
      /case\s+["']vault-saved-views["']\s+as\s+any\s*:\s*\n\s*return\s+<VaultSavedViewsPage\s*\/>/.test(
        src,
      ),
    ).toBe(true);
  });

  it("handleNavigate routes 'vault-saved-views' to /agent-studio/vault-saved-views", () => {
    expect(
      /["']vault-saved-views["'][\s\S]{0,200}navigate\(\s*["']\/agent-studio\/vault-saved-views["']\s*\)/.test(
        src,
      ),
    ).toBe(true);
  });
});

describe("AgentStudioSidebar — vault-saved-views wiring", () => {
  const file = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
  );
  const src = readFileSync(file, "utf8");

  it("adds 'vault-saved-views' to the AgentStudioView union", () => {
    expect(
      /export\s+type\s+AgentStudioView\s*=[\s\S]*?\|\s*["']vault-saved-views["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("Vaults SectionGroup contains a vault-saved-views entry", () => {
    expect(
      /label:\s*["']Vaults["'][\s\S]{0,600}key:\s*["']vault-saved-views["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("vault-saved-views entry uses the GitBranch icon", () => {
    expect(
      /key:\s*["']vault-saved-views["'][\s\S]{0,80}icon:\s*GitBranch/.test(
        src,
      ),
    ).toBe(true);
  });
});
