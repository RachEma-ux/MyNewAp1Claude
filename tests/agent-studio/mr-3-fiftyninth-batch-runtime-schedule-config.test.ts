/**
 * MR-3 fifty-ninth batch — repository.ts runtime + schedule config
 * + createPendingPermissionRequest Path-B consumers Cat B→A.
 * PR-V1-129.
 *
 * Reuses existing helpers (no new resolvers in this batch):
 *
 *   - updateRuntimeConfig(agentId)             → reuses draft.id from
 *     existing getCurrentDraft call → resolveDraftRoutedConn
 *   - updateScheduleConfig(agentId)            → same pattern
 *   - updateScheduleConfigByDraftId(draftId)   → resolveDraftRoutedConn
 *   - createPendingPermissionRequest(runtimeRunId) →
 *     resolveRuntimeRunRoutedConn (#874)
 *
 * Each of the 4 functions already had to look up a related row
 * (draft for updateRuntimeConfig / updateScheduleConfig, the
 * runtimeRun isn't even looked up here — the resolver loads it
 * implicitly via a single new SELECT). The new SELECTs are O(1)
 * round-trips that Phase-2 multi-region requires anyway.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

function extractFunctionBody(src: string, fnName: string): string {
  const decl = new RegExp(
    `\\n\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${fnName}\\s*[<(]`,
  );
  const declMatch = src.match(decl);
  if (!declMatch || declMatch.index === undefined) return "";
  const start = declMatch.index;
  const declEnd = start + declMatch[0].length;
  const afterDecl = src.slice(declEnd);
  const nextMatch = afterDecl.match(
    /\n\s*(?:export\s+)?(?:async\s+)?function\s+\w+\s*[<(]/,
  );
  const end =
    nextMatch && nextMatch.index !== undefined
      ? declEnd + nextMatch.index
      : src.length;
  return stripComments(src.slice(start, end));
}

describe("MR-3 fifty-ninth batch — runtime + schedule + pending permission Path B consumers", () => {
  const file = resolve(__dirname, "../../server/agent-studio/repository.ts");
  const src = readFileSync(file, "utf8");

  it.each(["updateRuntimeConfig", "updateScheduleConfig"])(
    "%s routes via resolveDraftRoutedConn(lookupConn, draft.id)",
    (fnName) => {
      const body = extractFunctionBody(src, fnName);
      expect(body.length).toBeGreaterThan(0);
      expect(
        /resolveDraftRoutedConn\s*\(\s*lookupConn\s*,\s*draft\.id\s*\)/.test(
          body,
        ),
      ).toBe(true);
      expect(
        /conn\s*\n?\s*\.update\s*\(\s*agsAgentDrafts\s*\)/.test(body),
      ).toBe(true);
    },
  );

  it("updateScheduleConfigByDraftId routes via resolveDraftRoutedConn(lookupConn, draftId)", () => {
    const body = extractFunctionBody(src, "updateScheduleConfigByDraftId");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /resolveDraftRoutedConn\s*\(\s*lookupConn\s*,\s*draftId\s*\)/.test(body),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.update\s*\(\s*agsAgentDrafts\s*\)/.test(body),
    ).toBe(true);
  });

  it("createPendingPermissionRequest routes via resolveRuntimeRunRoutedConn(lookupConn, input.runtimeRunId)", () => {
    const body = extractFunctionBody(src, "createPendingPermissionRequest");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /resolveRuntimeRunRoutedConn\s*\(\s*lookupConn\s*,\s*input\.runtimeRunId\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /conn\s*\n?\s*\.insert\s*\(\s*agsPendingPermissionRequests\s*\)/.test(
        body,
      ),
    ).toBe(true);
  });
});
