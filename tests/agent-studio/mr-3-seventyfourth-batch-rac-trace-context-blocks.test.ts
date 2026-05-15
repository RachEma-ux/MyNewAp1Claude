/**
 * MR-3 seventy-fourth batch — services/rac/trace/store.ts::
 * listContextBlocks Path-A read consumer.
 * PR-V1-144.
 *
 * Twelfth read-path Path-X promotion. agsRacContextBlocks has no
 * workspaceId column directly; the parent agsRacRuntimeTraces row
 * carries it. Pre-projection SELECT pulls workspaceId from the
 * parent trace, then the SELECT on agsRacContextBlocks routes to
 * the home region.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-3 seventy-fourth batch — listContextBlocks Path-A", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/rac/trace/store.ts",
  );
  const src = readFileSync(file, "utf8");

  it("listContextBlocks pre-projects workspaceId from agsRacRuntimeTraces then routes SELECT on agsRacContextBlocks", () => {
    const startIdx = src.indexOf("export async function listContextBlocks");
    expect(startIdx).toBeGreaterThan(-1);
    const remainder = src.slice(startIdx + "export async function listContextBlocks".length);
    const nextExportIdx = remainder.indexOf("export async function ");
    const endIdx =
      nextExportIdx >= 0
        ? startIdx + "export async function listContextBlocks".length + nextExportIdx
        : src.length;
    const body = src.slice(startIdx, endIdx);

    expect(
      /lookupDb\s*\n?\s*\.select\s*\(\s*\{\s*workspaceId:\s*agsRacRuntimeTraces\.workspaceId\s*\}\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /getAsDbForWorkspace\s*\(\s*wsRows\[0\]\.workspaceId\s*\)\s*\?\?\s*lookupDb/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /db\s*\n?\s*\.select\s*\(\s*\)\s*\n?\s*\.from\s*\(\s*agsRacContextBlocks\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });
});
