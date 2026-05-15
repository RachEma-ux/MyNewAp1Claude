/**
 * MR-3 sixty-third batch — services/cag/store.ts read paths Path-B
 * consumer Cat B-read → A-read.
 * PR-V1-133.
 *
 * Migrates the two draftId-keyed reads to Path B so Phase-2
 * multi-region also routes READs to the home region:
 *
 *   - getLatestPack(agentDraftId)
 *   - listPacks(agentDraftId)
 *
 * Both reads previously used the bootstrap getAsDb() handle. Under
 * Phase-1 (single-region shim) the behavior is bit-for-bit
 * identical; under Phase-2 the SELECT now routes via the workspace-
 * scoped handle. Falls back to bootstrap when Path B returns null
 * (legacy drafts pre-Phase-11 with no binding).
 *
 * The `markPackUsed` / `recordPackTokenActual` / `markPackStale`
 * mutations already use the discovering-helper pattern from prior
 * batches.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-3 sixty-third batch — cag/store.ts Path B read consumers", () => {
  const file = resolve(__dirname, "../../server/agent-studio/services/cag/store.ts");
  const src = readFileSync(file, "utf8");

  it.each(["getLatestPack", "listPacks"])(
    "%s dynamically imports resolveWorkspaceIdForDraft and routes via getAsDbForWorkspace with fallback",
    (fnName) => {
      const startIdx = src.indexOf(`export async function ${fnName}`);
      expect(startIdx).toBeGreaterThan(-1);
      // Bound the slice to just this function — find the next
      // export async function as the end marker.
      const remainder = src.slice(startIdx + `export async function ${fnName}`.length);
      const nextExportIdx = remainder.indexOf("export async function ");
      const endIdx =
        nextExportIdx >= 0
          ? startIdx + `export async function ${fnName}`.length + nextExportIdx
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
        /db\s*\n?\s*\.select\s*\(\s*\)/.test(body),
      ).toBe(true);
    },
  );
});
