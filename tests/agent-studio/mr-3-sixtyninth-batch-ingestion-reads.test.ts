/**
 * MR-3 sixty-ninth batch — ingestion service reads Path-A
 * discovering-helper migration Cat B-read → A-read.
 * PR-V1-139.
 *
 * 2 reads migrated:
 *   - services/ingestion/ingestion-job-service.ts::getJob(jobId)
 *     - agsIngestionJobs.workspaceId is non-null FK
 *   - services/ingestion/provenance-service.ts::getProvenance(provenanceId)
 *     - agsProvenanceRecords.workspaceId is non-null FK
 *
 * Seventh read-path Path-X promotion. Each: pre-projection SELECT
 * pulls workspaceId from the same table on the bootstrap handle,
 * then the full-row SELECT routes via getAsDbForWorkspace.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-3 sixty-ninth batch — ingestion service reads Path-A", () => {
  function loadFn(filePath: string, name: string): string {
    const src = readFileSync(filePath, "utf8");
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

  it("getJob pre-projects workspaceId from agsIngestionJobs then routes the full SELECT", () => {
    const body = loadFn(
      resolve(
        __dirname,
        "../../server/agent-studio/services/ingestion/ingestion-job-service.ts",
      ),
      "getJob",
    );
    expect(body.length).toBeGreaterThan(0);
    expect(
      /lookupDb\s*\n?\s*\.select\s*\(\s*\{\s*workspaceId:\s*agsIngestionJobs\.workspaceId\s*\}\s*\)/.test(
        body,
      ),
    ).toBe(true);
    expect(
      /getAsDbForWorkspace\s*\(\s*wsRows\[0\]\.workspaceId\s*\)\s*\?\?\s*lookupDb/.test(
        body,
      ),
    ).toBe(true);
  });

  it("getProvenance pre-projects workspaceId from agsProvenanceRecords then routes the full SELECT", () => {
    const body = loadFn(
      resolve(
        __dirname,
        "../../server/agent-studio/services/ingestion/provenance-service.ts",
      ),
      "getProvenance",
    );
    expect(body.length).toBeGreaterThan(0);
    expect(
      /lookupDb\s*\n?\s*\.select\s*\(\s*\{\s*workspaceId:\s*agsProvenanceRecords\.workspaceId\s*\}\s*\)/.test(
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
