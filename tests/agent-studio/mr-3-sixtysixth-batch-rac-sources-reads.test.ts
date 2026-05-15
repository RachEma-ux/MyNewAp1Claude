/**
 * MR-3 sixty-sixth batch — services/rac/sources/store.ts ::
 * getSource(sourceId) + listSourcesForProfile(profileId) Path-A
 * discovering-helper reads.
 * PR-V1-136.
 *
 * Fourth read-path Path-X promotion. Different from the Path-B
 * draftId reads (#884-#886): these are id-keyed reads where the row
 * carries workspaceId directly (getSource) or via the parent profile
 * (listSourcesForProfile). A pre-projection SELECT pulls workspaceId
 * up; the full-row SELECT then routes via getAsDbForWorkspace.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-3 sixty-sixth batch — rac source reads Path-A migration", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/rac/sources/store.ts",
  );
  const src = readFileSync(file, "utf8");

  function fnBody(name: string): string {
    const startIdx = src.indexOf(`export async function ${name}`);
    if (startIdx === -1) return "";
    const remainder = src.slice(startIdx + `export async function ${name}`.length);
    const nextExportIdx = remainder.indexOf("export async function ");
    const endIdx =
      nextExportIdx >= 0
        ? startIdx + `export async function ${name}`.length + nextExportIdx
        : src.length;
    return src.slice(startIdx, endIdx);
  }

  it("getSource pre-selects workspaceId from agsRacSources then routes the full SELECT", () => {
    const body = fnBody("getSource");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /lookupDb\s*\n?\s*\.select\s*\(\s*\{\s*workspaceId:\s*agsRacSources\.workspaceId\s*\}\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /getAsDbForWorkspace\s*\(\s*wsRows\[0\]\.workspaceId\s*\)\s*\?\?\s*lookupDb/.test(
        body,
      ),
    ).toBe(true);
  });

  it("listSourcesForProfile pre-selects workspaceId from agsRacProfiles then routes the SELECT", () => {
    const body = fnBody("listSourcesForProfile");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /lookupDb\s*\n?\s*\.select\s*\(\s*\{\s*workspaceId:\s*agsRacProfiles\.workspaceId\s*\}\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /getAsDbForWorkspace\s*\(\s*wsRows\[0\]\.workspaceId\s*\)\s*\?\?\s*lookupDb/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /db\s*\n?\s*\.select\s*\(\s*\)\s*\n?\s*\.from\s*\(\s*agsRacSources\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });
});
