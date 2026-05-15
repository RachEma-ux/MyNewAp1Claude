/**
 * Cross-region guard tests — V2 Phase MR-1 Phase-2 tenth slice.
 * PR-V1-158.
 *
 * Covers every documented branch:
 *   - Process regionKey unset → no-op (single-region baseline).
 *   - Workspace has no pin → no-op (primary fallback).
 *   - Pin matches process region → no-op.
 *   - Pin doesn't match + not replicated → throws.
 *   - Pin doesn't match + replicated → no-op.
 *
 * Also asserts:
 *   - Hard-rule compliance on the guard file.
 *   - Public-api barrel re-exports.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import {
  guardCrossRegionAccess,
} from "../../server/agent-studio/services/region/cross-region-guard.js";
import { CrossRegionAccessDeniedError } from "../../server/agent-studio/services/region/types.js";

describe("MR-1 Phase-2 — cross-region access guard", () => {
  it("no-op when process regionKey unset", () => {
    expect(() =>
      guardCrossRegionAccess(42, {
        processRegionKey: null,
        getCachedRegionKey: () => "eu-west-1",
      }),
    ).not.toThrow();
  });

  it("no-op when workspace has no pin (primary fallback)", () => {
    expect(() =>
      guardCrossRegionAccess(42, {
        processRegionKey: "us-west-1",
        getCachedRegionKey: () => null,
      }),
    ).not.toThrow();
  });

  it("no-op when pin matches the process regionKey", () => {
    expect(() =>
      guardCrossRegionAccess(42, {
        processRegionKey: "us-west-1",
        getCachedRegionKey: () => "us-west-1",
      }),
    ).not.toThrow();
  });

  it("throws when pin doesn't match + not replicated", () => {
    expect(() =>
      guardCrossRegionAccess(42, {
        processRegionKey: "us-west-1",
        getCachedRegionKey: () => "eu-west-1",
        isWorkspaceReplicated: () => false,
      }),
    ).toThrow(CrossRegionAccessDeniedError);
  });

  it("no-op when pin doesn't match BUT replicated flag is true", () => {
    expect(() =>
      guardCrossRegionAccess(42, {
        processRegionKey: "us-west-1",
        getCachedRegionKey: () => "eu-west-1",
        isWorkspaceReplicated: () => true,
      }),
    ).not.toThrow();
  });

  it("thrown error carries workspaceId + fromRegion + toRegion", () => {
    try {
      guardCrossRegionAccess(42, {
        processRegionKey: "us-west-1",
        getCachedRegionKey: () => "eu-west-1",
      });
      throw new Error("expected to throw");
    } catch (err) {
      if (!(err instanceof CrossRegionAccessDeniedError))
        throw new Error(`wrong error class: ${err}`);
      expect(err.fromRegion).toBe("eu-west-1");
      expect(err.toRegion).toBe("us-west-1");
      expect(err.workspaceId).toBe(42);
      expect(err.code).toBe("cross_region_access_denied");
    }
  });

  it("source-scan: hard-rule compliance", () => {
    const file = resolve(
      __dirname,
      "../../server/agent-studio/services/region/cross-region-guard.ts",
    );
    const src = readFileSync(file, "utf8");
    // Only allowed env read is the process region key.
    expect(/process\.env\.AGS_PROCESS_REGION_KEY/.test(src)).toBe(true);
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
    expect(/credential-resolver/.test(src)).toBe(false);
    expect(/dispatchMcpToolCall/.test(src)).toBe(false);
    expect(/neo4j-driver/.test(src)).toBe(false);
  });

  it("public-api barrel re-exports guard symbols", () => {
    const file = resolve(
      __dirname,
      "../../server/agent-studio/services/region/public-api.ts",
    );
    const src = readFileSync(file, "utf8");
    expect(src).toContain("./cross-region-guard.js");
    expect(src).toContain("guardCrossRegionAccess");
    expect(src).toContain("getProcessRegionKey");
    expect(src).toContain("CrossRegionGuardContext");
  });
});
