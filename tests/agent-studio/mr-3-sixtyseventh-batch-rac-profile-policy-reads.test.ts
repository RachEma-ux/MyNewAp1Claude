/**
 * MR-3 sixty-seventh batch — services/rac/sources/store.ts::
 * getProfile(profileId) + getPolicyForProfile(profileId) Path-A
 * discovering-helper reads.
 * PR-V1-137.
 *
 * Fifth read-path Path-X promotion. Both are id-keyed reads:
 *   - getProfile: agsRacProfiles.workspaceId is non-null; pull up,
 *     route the full SELECT.
 *   - getPolicyForProfile: agsRacPolicies has no workspaceId;
 *     resolve via parent agsRacProfiles, route the SELECT on
 *     agsRacPolicies.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-3 sixty-seventh batch — rac profile + policy reads Path-A", () => {
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

  it("getProfile pre-selects workspaceId then routes the full SELECT on agsRacProfiles", () => {
    const body = fnBody("getProfile");
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
  });

  it("getPolicyForProfile pre-selects workspaceId from agsRacProfiles then routes SELECT on agsRacPolicies", () => {
    const body = fnBody("getPolicyForProfile");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /lookupDb\s*\n?\s*\.select\s*\(\s*\{\s*workspaceId:\s*agsRacProfiles\.workspaceId\s*\}\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /db\s*\n?\s*\.select\s*\(\s*\)\s*\n?\s*\.from\s*\(\s*agsRacPolicies\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });
});
