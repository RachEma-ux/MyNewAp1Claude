/**
 * MR-3 seventy-third batch — services/extensions/manifest.ts ::
 * getExtensionById Path-A read consumer.
 * PR-V1-143.
 *
 * Eleventh read-path Path-X promotion. agsExtensions.workspaceId is
 * non-null FK; pre-projection pulls it up, then the full-row SELECT
 * routes via getAsDbForWorkspace.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-3 seventy-third batch — getExtensionById Path-A", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/extensions/manifest.ts",
  );
  const src = readFileSync(file, "utf8");

  it("getExtensionById pre-projects workspaceId from agsExtensions then routes the full SELECT", () => {
    const startIdx = src.indexOf("export async function getExtensionById");
    expect(startIdx).toBeGreaterThan(-1);
    const remainder = src.slice(startIdx + "export async function getExtensionById".length);
    const nextExportIdx = remainder.indexOf("export async function ");
    const endIdx =
      nextExportIdx >= 0
        ? startIdx + "export async function getExtensionById".length + nextExportIdx
        : src.length;
    const body = src.slice(startIdx, endIdx);

    expect(
      /lookupDb\s*\n?\s*\.select\s*\(\s*\{\s*workspaceId:\s*agsExtensions\.workspaceId\s*\}\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /getAsDbForWorkspace\s*\(\s*wsRows\[0\]\.workspaceId\s*\)\s*\?\?\s*lookupDb/.test(
        body,
      ),
    ).toBe(true);
  });
});
