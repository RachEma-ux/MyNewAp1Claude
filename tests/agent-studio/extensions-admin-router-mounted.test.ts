/**
 * Extensions admin router mount + shape source-scan — V1+ Phase 18
 * follow-up. PR-V1-162.
 *
 * Verifies the new admin tRPC router is wired correctly without
 * spinning up a live ASDB connection.
 *
 * Covers:
 *   - extensionsAdminRouter is imported + mounted at `extensions:`
 *     in the agent-studio router.
 *   - The router declares the 5 expected procedures (list/get/
 *     install/approve/setStatus) with admin guard + correct verb.
 *   - All inputs are Zod-validated.
 *   - Mutations route through the manifest helpers (no direct
 *     `agsExtensions` writes — preserves the governance contract).
 *   - Public-api barrel re-exports.
 *   - Hard-rule compliance.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("Phase 18 follow-up — extensions admin router mount + shape", () => {
  const routerFile = resolve(
    __dirname,
    "../../server/agent-studio/services/extensions/extensions-admin-router.ts",
  );
  const agentStudioRouterFile = resolve(
    __dirname,
    "../../server/agent-studio/api/router.ts",
  );
  const barrelFile = resolve(
    __dirname,
    "../../server/agent-studio/services/extensions/public-api.ts",
  );

  it("agent-studio router imports + mounts extensionsAdminRouter at `extensions`", () => {
    const src = readFileSync(agentStudioRouterFile, "utf8");
    expect(src).toContain(
      'import { extensionsAdminRouter } from "../services/extensions/extensions-admin-router"',
    );
    expect(/extensions:\s*extensionsAdminRouter\b/.test(src)).toBe(true);
  });

  it("router declares the 5 expected procedures with admin guard", () => {
    const src = readFileSync(routerFile, "utf8");
    const expected = ["list", "get", "install", "approve", "setStatus"];
    for (const proc of expected) {
      expect(src).toContain(`${proc}: adminProcedure`);
    }
  });

  it("mutations use .mutation; queries use .query", () => {
    const src = readFileSync(routerFile, "utf8");
    // Queries:
    expect(/list:\s*adminProcedure[\s\S]{0,300}\.query\(/.test(src)).toBe(true);
    expect(/get:\s*adminProcedure[\s\S]{0,300}\.query\(/.test(src)).toBe(true);
    // Mutations:
    expect(/install:\s*adminProcedure[\s\S]{0,500}\.mutation\(/.test(src)).toBe(
      true,
    );
    expect(/approve:\s*adminProcedure[\s\S]{0,500}\.mutation\(/.test(src)).toBe(
      true,
    );
    expect(/setStatus:\s*adminProcedure[\s\S]{0,500}\.mutation\(/.test(src)).toBe(
      true,
    );
  });

  it("inputs are Zod-validated against closed taxonomies", () => {
    const src = readFileSync(routerFile, "utf8");
    expect(src).toContain('import { z } from "zod"');
    expect(src).toContain("ExtensionManifestSchema = z.object({");
    expect(src).toContain("InstallInputSchema = z.object({");
    expect(src).toContain("ApproveInputSchema = z.object({");
    expect(src).toContain("SetStatusInputSchema = z.object({");
    expect(src).toContain("ListInputSchema = z.object({");
    expect(src).toContain("z.enum(EXTENSION_CAPABILITY_LANES)");
    expect(src).toContain("z.enum(EXTENSION_GOVERNANCE_STATUSES)");
  });

  it("mutations route through manifest helpers (no direct agsExtensions writes)", () => {
    const src = readFileSync(routerFile, "utf8");
    expect(src).toContain("installExtension({");
    expect(src).toContain("approveExtension({");
    expect(src).toContain("setExtensionStatus(");
    // Direct agsExtensions writes from the router are disallowed.
    expect(/db\.\s*(insert|update|delete)\s*\(\s*agsExtensions/.test(src)).toBe(
      false,
    );
  });

  it("public-api barrel re-exports extensionsAdminRouter", () => {
    const src = readFileSync(barrelFile, "utf8");
    expect(src).toContain("./extensions-admin-router.js");
    expect(src).toContain("extensionsAdminRouter");
  });

  it("hard-rule compliance on the router file", () => {
    const src = readFileSync(routerFile, "utf8");
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
    expect(/credential-resolver/.test(src)).toBe(false);
    expect(/dispatchMcpToolCall/.test(src)).toBe(false);
    expect(/neo4j-driver/.test(src)).toBe(false);
  });
});
