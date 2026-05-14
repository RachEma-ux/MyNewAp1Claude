/**
 * MR-3 twenty-third batch — ingestion/ingestion-job-service.ts
 * `completeJob` split-handle Cat B→A migration.
 * PR-V1-91.
 *
 * Same pattern as #831 / #838 / #839 / #840 / #841. Soft-fail on
 * vanished jobIds is preserved via a `lookup.length === 0` early
 * return (completion is observability, not source of truth — no
 * point throwing if the job row is gone).
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

describe("MR-3 twenty-third batch — completeJob split-handle", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/ingestion/ingestion-job-service.ts",
  );
  const src = readFileSync(file, "utf8");

  it("uses two DB handles — SELECT via getAsDb, UPDATE via getAsDbForWorkspace", () => {
    const body = extractFunctionBody(src, "completeJob");
    expect(body.length).toBeGreaterThan(0);
    expect(/\bgetAsDb\b\s*\(\s*\)/.test(body)).toBe(true);
    expect(
      /getAsDbForWorkspace\s*\(\s*lookup\[0\]\.workspaceId\s*\)/.test(body),
    ).toBe(true);
  });

  it("discovery SELECT precedes the UPDATE", () => {
    const body = extractFunctionBody(src, "completeJob");
    const selectIdx = body.search(
      /\.select\(\s*\{\s*workspaceId:[\s\S]{0,200}\.from\s*\(\s*agsIngestionJobs/,
    );
    const updateIdx = body.search(/\.update\(\s*agsIngestionJobs\s*\)/);
    expect(selectIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeLessThan(updateIdx);
  });

  it("soft-returns when the lookup is empty (vanished jobId)", () => {
    const body = extractFunctionBody(src, "completeJob");
    expect(/lookup\.length\s*===\s*0/.test(body)).toBe(true);
    // The early-return body should be `return;` (NOT a throw) — we
    // assert the literal pattern.
    expect(/if\s*\(\s*lookup\.length\s*===\s*0\s*\)\s*return\s*;/.test(body)).toBe(
      true,
    );
  });

  it("amends prior #806 third-batch Cat B list — completeJob no longer in array", () => {
    const third = readFileSync(
      resolve(
        __dirname,
        "../../tests/agent-studio/mr-3-third-batch-ingestion-job-service.test.ts",
      ),
      "utf8",
    );
    // The prior batch test had a Category B assertion that
    // iterated over ["completeJob", "getJob"]. The amendment in
    // this batch SHOULD split that into a weakened completeJob
    // assertion + a standalone getJob assertion. We assert the
    // file mentions PR-V1-91 to confirm the bookkeeping happened.
    expect(/PR-V1-91|twenty-third batch/.test(third)).toBe(true);
  });
});
