/**
 * Region admin router mount + shape source-scan — V2 Phase MR-1
 * Phase-2 eighth slice. PR-V1-156.
 *
 * Source-scan only — verifies:
 *   - `regionAdminRouter` is imported + mounted at `region:` in the
 *     agent-studio router.
 *   - The router declares the 8 expected procedures with the right
 *     verb (query vs mutation) + admin guard.
 *   - Input shapes are Zod-validated.
 *   - Public-api barrel re-exports.
 *   - Hard-rule compliance.
 *
 * Behavioral coverage (live tRPC call against ASDB) lands when the
 * React surface ships.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-1 Phase-2 — region admin router mount + shape", () => {
  const routerFile = resolve(
    __dirname,
    "../../server/agent-studio/services/region/region-admin-router.ts",
  );
  const agentStudioRouterFile = resolve(
    __dirname,
    "../../server/agent-studio/api/router.ts",
  );
  const barrelFile = resolve(
    __dirname,
    "../../server/agent-studio/services/region/public-api.ts",
  );

  it("agent-studio router imports + mounts regionAdminRouter at `region`", () => {
    const src = readFileSync(agentStudioRouterFile, "utf8");
    expect(src).toContain(
      'import { regionAdminRouter } from "../services/region/region-admin-router"',
    );
    expect(/region:\s*regionAdminRouter\b/.test(src)).toBe(true);
  });

  it("router declares the 8 expected procedures with admin guard", () => {
    const src = readFileSync(routerFile, "utf8");
    const expected = [
      "listActiveRegions",
      "registerRegion",
      "listPins",
      "getPin",
      "setPin",
      "removePin",
      "getCacheStatus",
      "getRewarmCronStatus",
    ];
    for (const proc of expected) {
      expect(src).toContain(`${proc}: adminProcedure`);
    }
  });

  it("mutation procedures use .mutation; queries use .query", () => {
    const src = readFileSync(routerFile, "utf8");
    // Mutations:
    expect(
      /registerRegion:\s*adminProcedure[\s\S]{0,500}\.mutation\(/.test(src),
    ).toBe(true);
    expect(/setPin:\s*adminProcedure[\s\S]{0,500}\.mutation\(/.test(src)).toBe(
      true,
    );
    expect(
      /removePin:\s*adminProcedure[\s\S]{0,500}\.mutation\(/.test(src),
    ).toBe(true);
    // Queries:
    expect(/listActiveRegions:\s*adminProcedure\.query\(/.test(src)).toBe(true);
    expect(/listPins:\s*adminProcedure\.query\(/.test(src)).toBe(true);
    expect(/getPin:\s*adminProcedure[\s\S]{0,200}\.query\(/.test(src)).toBe(
      true,
    );
    expect(/getCacheStatus:\s*adminProcedure\.query\(/.test(src)).toBe(true);
    expect(/getRewarmCronStatus:\s*adminProcedure\.query\(/.test(src)).toBe(
      true,
    );
  });

  it("input shapes are Zod-validated", () => {
    const src = readFileSync(routerFile, "utf8");
    expect(src).toContain('import { z } from "zod"');
    expect(src).toContain("RegisterRegionInputSchema = z.object({");
    expect(src).toContain("SetPinInputSchema = z.object({");
    expect(src).toContain("RemovePinInputSchema = z.object({");
    expect(src).toContain("GetPinInputSchema = z.object({");
  });

  it("public-api barrel re-exports regionAdminRouter", () => {
    const src = readFileSync(barrelFile, "utf8");
    expect(src).toContain("./region-admin-router.js");
    expect(src).toContain("regionAdminRouter");
  });

  it("hard-rule compliance on the router file", () => {
    const src = readFileSync(routerFile, "utf8");
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
    expect(/credential-resolver/.test(src)).toBe(false);
    expect(/dispatchMcpToolCall/.test(src)).toBe(false);
    expect(/neo4j-driver/.test(src)).toBe(false);
  });
});
