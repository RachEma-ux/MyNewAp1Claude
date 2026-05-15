/**
 * MR-3 sixty-eighth batch — services/canvas/canvas-service.ts read
 * paths Path-A migration Cat B-read → A-read.
 * PR-V1-138.
 *
 * 4 reads migrated:
 *   - getCanvasById(canvasId)         → resolveWorkspaceIdForCanvas
 *   - listCanvasesByVault(vaultId)    → pre-projection from agsVaults
 *   - getCanvasSnapshot(canvasId)     → resolveWorkspaceIdForCanvas
 *   - listNoteReferencesForCanvas(c)  → resolveWorkspaceIdForCanvas
 *
 * Sixth read-path Path-X promotion (after #884-#888).
 *
 * The mutations (createCanvas, createCanvasNode, createCanvasEdge)
 * already use the same helper (#844, #845, #94).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-3 sixty-eighth batch — canvas reads Path-A", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/canvas-service.ts",
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

  it.each([
    "getCanvasById",
    "getCanvasSnapshot",
    "listNoteReferencesForCanvas",
  ])("%s reuses resolveWorkspaceIdForCanvas and routes via getAsDbForWorkspace", (fnName) => {
    const body = fnBody(fnName);
    expect(body.length).toBeGreaterThan(0);
    expect(
      /resolveWorkspaceIdForCanvas\s*\(\s*lookupDb\s*,\s*canvasId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /workspaceId\s*!=\s*null\s*\?\s*\(\s*getAsDbForWorkspace\s*\(\s*workspaceId\s*\)\s*\?\?\s*lookupDb\s*\)\s*:\s*lookupDb/.test(
        body,
      ),
    ).toBe(true);
  });

  it("listCanvasesByVault pre-projects workspaceId from agsVaults then routes the SELECT on agsCanvases", () => {
    const body = fnBody("listCanvasesByVault");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /lookupDb\s*\n?\s*\.select\s*\(\s*\{\s*workspaceId:\s*agsVaults\.workspaceId\s*\}\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /db\s*\n?\s*\.select\s*\(\s*\)\s*\n?\s*\.from\s*\(\s*agsCanvases\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });
});
