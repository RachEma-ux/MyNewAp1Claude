/**
 * MR-3 third batch — ingestion/ingestion-job-service.ts source-scan
 * (PR-V1-47).
 *
 * Phase F third batch per
 * `docs/implementation/agent-studio-mr-3-getasdb-inventory.md`.
 *
 * Covers:
 *   - `startJob` calls `getAsDbForWorkspace(input.workspaceId)`,
 *     NOT `getAsDb()`. StartJobInput.workspaceId is required.
 *   - The file imports `getAsDbForWorkspace` from db/connection.
 *   - `completeJob` and `getJob` still call `getAsDb()` (they take
 *     only `jobId` — workspaceId would have to be plumbed; Category
 *     B in the inventory).
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
  // Find the start of `\nexport async function name(` or
  // `\nexport function name(`. Walk PAST the full decl match (not
  // just +1 char) and then find the start of the NEXT function
  // declaration (or end-of-file).
  const decl = new RegExp(
    `\\n\\s*export\\s+(?:async\\s+)?function\\s+${fnName}\\s*[<(]`,
  );
  const declMatch = src.match(decl);
  if (!declMatch || declMatch.index === undefined) return "";
  const start = declMatch.index;
  const declEnd = start + declMatch[0].length;
  const afterDecl = src.slice(declEnd);
  const nextMatch = afterDecl.match(
    /\n\s*export\s+(?:async\s+)?function\s+\w+\s*[<(]/,
  );
  const end =
    nextMatch && nextMatch.index !== undefined
      ? declEnd + nextMatch.index
      : src.length;
  return stripComments(src.slice(start, end));
}

describe("MR-3 third batch source-scan — ingestion/ingestion-job-service.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/ingestion/ingestion-job-service.ts",
  );
  const src = readFileSync(file, "utf8");

  it("imports getAsDbForWorkspace alongside getAsDb from db/connection", () => {
    expect(
      /import\s*\{[^}]*getAsDbForWorkspace[^}]*\}\s*from\s+["']\.\.\/\.\.\/db\/connection(\.js)?["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("startJob calls getAsDbForWorkspace(input.workspaceId)", () => {
    const body = extractFunctionBody(src, "startJob");
    expect(body.length).toBeGreaterThan(0);
    expect(
      /getAsDbForWorkspace\s*\(\s*input\.workspaceId\s*\)/.test(body),
    ).toBe(true);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(false);
  });

  // NOTE: `completeJob` was Cat B at the time of #806 (jobId-scoped)
  // and was promoted to Cat A in PR-V1-91 / #842 (twenty-third batch)
  // via the split-handle pattern (SELECT via getAsDb() for
  // workspaceId discovery, then UPDATE via
  // getAsDbForWorkspace(lookup[0].workspaceId)). See
  // tests/agent-studio/mr-3-twentythird-batch-ingestion-job-
  // complete.test.ts for the up-to-date two-handle assertions. We
  // weaken the prior assertion to just "completeJob still references
  // getAsDb()" (true — for the discovery SELECT). `getJob` remains
  // Cat B (read-only; intentional).
  it("completeJob still references getAsDb() (post-#842 split-handle)", () => {
    const body = extractFunctionBody(src, "completeJob");
    expect(body.length).toBeGreaterThan(0);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
  });

  it("getJob is Category B (jobId-scoped, no workspaceId plumbing) — still calls getAsDb()", () => {
    const body = extractFunctionBody(src, "getJob");
    expect(body.length).toBeGreaterThan(0);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
    expect(/getAsDbForWorkspace/.test(body)).toBe(false);
  });
});
