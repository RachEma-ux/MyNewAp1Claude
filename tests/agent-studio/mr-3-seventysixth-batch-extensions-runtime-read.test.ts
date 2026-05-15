/**
 * MR-3 seventy-sixth batch — services/extensions/runtime.ts ::
 * loadExtensionById Path-A read consumer.
 * PR-V1-146.
 *
 * Fourteenth read-path Path-X promotion. Mirrors
 * services/extensions/manifest.ts::getExtensionById (#894) — same
 * agsExtensions.workspaceId pre-projection + routed SELECT pattern,
 * but on the internal `loadExtensionById` helper that callers in
 * runtime.ts use (the manifest version is the public surface).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-3 seventy-sixth batch — loadExtensionById Path-A", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/extensions/runtime.ts",
  );
  const src = readFileSync(file, "utf8");

  it("loadExtensionById pre-projects workspaceId from agsExtensions then routes the full SELECT", () => {
    const startIdx = src.indexOf("async function loadExtensionById");
    expect(startIdx).toBeGreaterThan(-1);
    const remainder = src.slice(startIdx + "async function loadExtensionById".length);
    const nextFnIdx = remainder.indexOf("async function ");
    const endIdx =
      nextFnIdx >= 0
        ? startIdx + "async function loadExtensionById".length + nextFnIdx
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
