/**
 * MR-3 sixty-fourth batch — services/cag/events.ts::listPackEvents
 * Path-B read consumer Cat B-read → A-read.
 * PR-V1-134.
 *
 * Second read-path Path-B promotion (after #884 cag/store reads).
 * Same shape: dynamic import of Path B resolver, route via
 * getAsDbForWorkspace with bootstrap fallback.
 *
 * Out of scope: appendPackEvent uses workspaceId-routed handle
 * directly from caller-supplied workspaceId (already migrated).
 * listEventsByPack already accepts workspaceId as input (no Path-B
 * walk needed).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-3 sixty-fourth batch — cag/events.ts::listPackEvents Path B read consumer", () => {
  const file = resolve(__dirname, "../../server/agent-studio/services/cag/events.ts");
  const src = readFileSync(file, "utf8");

  it("listPackEvents dynamically imports resolveWorkspaceIdForDraft and routes via getAsDbForWorkspace", () => {
    const startIdx = src.indexOf("export async function listPackEvents");
    expect(startIdx).toBeGreaterThan(-1);
    const remainder = src.slice(startIdx + "export async function listPackEvents".length);
    const nextExportIdx = remainder.indexOf("export async function ");
    const endIdx =
      nextExportIdx >= 0
        ? startIdx + "export async function listPackEvents".length + nextExportIdx
        : src.length;
    const body = src.slice(startIdx, endIdx);

    expect(
      /await\s+import\s*\(\s*["']\.\.\/region\/draft-workspace-resolver["']\s*\)/.test(
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
      /db\s*\n?\s*\.select\s*\(\s*\)\s*\n?\s*\.from\s*\(\s*agsCagPackEvents\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });
});
