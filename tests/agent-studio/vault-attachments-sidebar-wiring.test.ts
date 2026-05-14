/**
 * VaultAttachments sidebar wiring source-scan — V1+ 15-δ slice
 * (PR-V1-84).
 *
 * Verifies the AgentStudioSidebar adds "vault-attachments" to the
 * view union and the new "Vaults" group, and the Shell navigation
 * handler routes clicks to /agent-studio/vault-attachments.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("AgentStudioSidebar — vault-attachments wiring", () => {
  const file = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
  );
  const src = readFileSync(file, "utf8");

  it("adds 'vault-attachments' to the AgentStudioView union", () => {
    expect(
      /export\s+type\s+AgentStudioView\s*=[\s\S]*?\|\s*["']vault-attachments["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("declares a 'Vaults' SectionGroup with a vault-attachments entry", () => {
    expect(
      /label:\s*["']Vaults["'][\s\S]{0,400}key:\s*["']vault-attachments["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("imports the Folder icon (used for the vault-attachments entry)", () => {
    expect(/\bFolder,\s*$/m.test(src)).toBe(true);
    expect(/icon:\s*Folder\b/.test(src)).toBe(true);
  });
});

describe("AgentStudioShell — vault-attachments navigation routing", () => {
  const file = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/AgentStudioShell.tsx",
  );
  const src = readFileSync(file, "utf8");

  it("handleNavigate routes 'vault-attachments' to /agent-studio/vault-attachments", () => {
    // Match the (key as string) === "vault-attachments" branch + the
    // navigate call inside it.
    expect(
      /["']vault-attachments["'][\s\S]{0,200}navigate\(\s*["']\/agent-studio\/vault-attachments["']\s*\)/.test(
        src,
      ),
    ).toBe(true);
  });
});
