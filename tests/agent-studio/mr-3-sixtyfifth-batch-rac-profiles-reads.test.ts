/**
 * MR-3 sixty-fifth batch — services/rac/sources/store.ts::
 * listProfilesForDraft Path-B read consumer Cat B-read → A-read.
 * PR-V1-135.
 *
 * Third read-path Path-B promotion (after #884/#885 cag reads).
 * Path B resolver from a different relative path (..\/..\/region\/),
 * same shape: dynamic import + bootstrap fallback.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-3 sixty-fifth batch — rac/sources/store.ts::listProfilesForDraft Path B read", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/rac/sources/store.ts",
  );
  const src = readFileSync(file, "utf8");

  it("listProfilesForDraft dynamically imports resolveWorkspaceIdForDraft and routes via getAsDbForWorkspace", () => {
    const startIdx = src.indexOf("export async function listProfilesForDraft");
    expect(startIdx).toBeGreaterThan(-1);
    const remainder = src.slice(startIdx + "export async function listProfilesForDraft".length);
    const nextExportIdx = remainder.indexOf("export async function ");
    const endIdx =
      nextExportIdx >= 0
        ? startIdx + "export async function listProfilesForDraft".length + nextExportIdx
        : src.length;
    const body = src.slice(startIdx, endIdx);

    expect(
      /await\s+import\s*\(\s*["']\.\.\/\.\.\/region\/draft-workspace-resolver["']\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /resolveWorkspaceIdForDraft\s*\(\s*lookupDb\s*,\s*agentDraftId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /workspaceId\s*!=\s*null\s*\?\s*\(\s*getAsDbForWorkspace\s*\(\s*workspaceId\s*\)\s*\?\?\s*lookupDb\s*\)\s*:\s*lookupDb/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /db\s*\n?\s*\.select\s*\(\s*\)\s*\n?\s*\.from\s*\(\s*agsRacProfiles\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });
});
