/**
 * Extensions per-invocation details drill-down — PR-V1-204.
 *
 * Symmetric with publish-execution-details (#940). The recent
 * invocations log payload doesn't include the `details` JSON
 * (could be large per row); adds an on-demand fetch via
 * `getExtensionInvocationById` + per-row toggle in the log table.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-204 — extensions per-invocation details drill-down", () => {
  const manifest = resolve(
    __dirname,
    "../../server/agent-studio/services/extensions/manifest.ts",
  );
  const router = resolve(
    __dirname,
    "../../server/agent-studio/services/extensions/extensions-admin-router.ts",
  );
  const barrel = resolve(
    __dirname,
    "../../server/agent-studio/services/extensions/public-api.ts",
  );
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/ExtensionsAdminPanel.tsx",
  );

  it("service exports getExtensionInvocationById + ExtensionInvocationDetail", () => {
    const src = readFileSync(manifest, "utf8");
    expect(
      /export\s+async\s+function\s+getExtensionInvocationById/.test(src),
    ).toBe(true);
    expect(/export\s+interface\s+ExtensionInvocationDetail/.test(src)).toBe(
      true,
    );
    expect(/extends\s+ExtensionInvocationLogRow/.test(src)).toBe(true);
    expect(/details:\s*Record<string,\s*unknown>\s*\|\s*null/.test(src)).toBe(
      true,
    );
    expect(/Promise<ExtensionInvocationDetail\s*\|\s*null>/.test(src)).toBe(
      true,
    );
  });

  it("admin router exposes getInvocationById as adminProcedure.query", () => {
    const src = readFileSync(router, "utf8");
    expect(src).toContain("getInvocationById");
    expect(
      /getInvocationById:\s*adminProcedure[\s\S]{0,400}\.query\(/.test(src),
    ).toBe(true);
    expect(/getExtensionInvocationById\(input\.invocationId\)/.test(src)).toBe(
      true,
    );
  });

  it("barrel re-exports the function + detail type", () => {
    const src = readFileSync(barrel, "utf8");
    expect(src).toContain("getExtensionInvocationById");
    expect(src).toContain("ExtensionInvocationDetail");
  });

  it("UI per-row toggle uses lazy-enabled query + renders details JSON", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      "trpc.agentStudio.extensions.getInvocationById.useQuery",
    );
    expect(/enabled:\s*expandedInvocationId\s*!==\s*null/.test(src)).toBe(true);
    expect(src).toContain("extension-invocation-details-toggle-");
    expect(src).toContain("extension-invocation-details-row-");
    expect(
      /isInvDetailExpanded\s*\?\s*"hide"\s*:\s*"view"/.test(src),
    ).toBe(true);
    expect(
      /JSON\.stringify\(\s*invocationDetailQ\.data\.details\s*\?\?\s*\{\},\s*null,\s*2\s*\)/.test(
        src,
      ),
    ).toBe(true);
    // Log table colSpan=8 (When/Extension/Lane/Tool/Capability/OK?/
    // Error/Details).
    expect(/colSpan=\{8\}/.test(src)).toBe(true);
  });
});
