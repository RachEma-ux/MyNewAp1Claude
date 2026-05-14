/**
 * VaultAttachmentsPage Shell wiring source-scan — V1+ 15-δ slice
 * (PR-V1-83).
 *
 * Verifies the AgentStudioShell URL parser routes
 * `/agent-studio/vault-attachments` to the new view + the render
 * case mounts VaultAttachmentsPage.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("AgentStudioShell — vault-attachments wiring", () => {
  const file = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/AgentStudioShell.tsx",
  );
  const src = readFileSync(file, "utf8");

  it("declares the lazy VaultAttachmentsPage import", () => {
    expect(
      /const\s+VaultAttachmentsPage\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*["']\.\.\/pages\/VaultAttachmentsPage["']\s*\)\s*\)/.test(
        src,
      ),
    ).toBe(true);
  });

  it("URL parser matches /agent-studio/vault-attachments → view='vault-attachments'", () => {
    expect(
      /path\.startsWith\(\s*["']\/agent-studio\/vault-attachments["']\s*\)/.test(
        src,
      ),
    ).toBe(true);
    expect(
      /view:\s*["']vault-attachments["']/.test(src),
    ).toBe(true);
  });

  it("global-view switch renders <VaultAttachmentsPage /> for case 'vault-attachments'", () => {
    expect(
      /case\s+["']vault-attachments["']\s+as\s+any\s*:\s*\n\s*return\s+<VaultAttachmentsPage\s*\/>/.test(
        src,
      ),
    ).toBe(true);
  });
});
