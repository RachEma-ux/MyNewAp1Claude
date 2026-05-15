/**
 * Extensions recent-invocations log — PR-V1-182.
 *
 * Source-scan that the new
 * `agentStudio.extensions.recentInvocations` query is wired
 * service → barrel → router → UI panel, with the workspace-bounded
 * filter that prevents cross-workspace id leaks.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-182 — extensions recent invocations log", () => {
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

  it("manifest exports listRecentInvocationsByWorkspace + log row interface", () => {
    const src = readFileSync(manifest, "utf8");
    expect(
      /export\s+async\s+function\s+listRecentInvocationsByWorkspace/.test(src),
    ).toBe(true);
    expect(/export\s+interface\s+ExtensionInvocationLogRow/.test(src)).toBe(
      true,
    );
    // The 8 fields the operator panel relies on.
    expect(/id:\s*number/.test(src)).toBe(true);
    expect(/extensionId:\s*number/.test(src)).toBe(true);
    expect(/lane:\s*string/.test(src)).toBe(true);
    expect(/invokedToolName:\s*string\s*\|\s*null/.test(src)).toBe(true);
    expect(/capabilityCheck:\s*string/.test(src)).toBe(true);
    expect(/succeeded:\s*boolean\s*\|\s*null/.test(src)).toBe(true);
    expect(/errorMessage:\s*string\s*\|\s*null/.test(src)).toBe(true);
    expect(/invokedAt:\s*Date/.test(src)).toBe(true);
  });

  it("manifest query is workspace-bounded + ORDER BY invokedAt DESC + LIMIT clamp", () => {
    const src = readFileSync(manifest, "utf8");
    const body = src.slice(
      src.indexOf("export async function listRecentInvocationsByWorkspace"),
      src.indexOf("export async function listExtensionsByWorkspace"),
    );
    // Workspace bound: pre-fetch the workspace's extensionIds and
    // intersect every query against them.
    expect(/workspaceExtensionIds/.test(body)).toBe(true);
    expect(/inArray\(\s*agsExtensionInvocations\.extensionId/.test(body)).toBe(
      true,
    );
    // Limit clamp [1, 500].
    expect(/Math\.max\(1,\s*Math\.min\(500,\s*args\.limit\s*\?\?\s*50\)\)/.test(body)).toBe(
      true,
    );
    // Sort newest first.
    expect(/desc\(\s*agsExtensionInvocations\.invokedAt\s*\)/.test(body)).toBe(
      true,
    );
  });

  it("barrel re-exports the function + log row type", () => {
    const src = readFileSync(barrel, "utf8");
    expect(src).toContain("listRecentInvocationsByWorkspace");
    expect(src).toContain("ExtensionInvocationLogRow");
  });

  it("router exposes recentInvocations as adminProcedure.query with cap-500 limit", () => {
    const src = readFileSync(router, "utf8");
    expect(src).toContain("recentInvocations");
    expect(
      /recentInvocations:\s*adminProcedure[\s\S]{0,800}\.query\(/.test(src),
    ).toBe(true);
    expect(/limit:\s*z\.number\(\)\.int\(\)\.positive\(\)\.max\(500\)/.test(src)).toBe(
      true,
    );
    expect(
      /listRecentInvocationsByWorkspace\(\s*\{[\s\S]{0,200}workspaceId:\s*input\.workspaceId/.test(
        src,
      ),
    ).toBe(true);
  });

  it("UI panel renders the recent-invocations table with filter + invalidation", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      "trpc.agentStudio.extensions.recentInvocations.useQuery",
    );
    expect(
      /utils\.agentStudio\.extensions\.recentInvocations\.invalidate/.test(src),
    ).toBe(true);
    expect(src).toContain('data-testid="extensions-recent-invocations-table"');
    // Per-extension filter dropdown.
    expect(src).toContain('id="extensions-recent-filter-extid"');
    // Capability column uses destructive color for non-"allowed".
    expect(
      /r\.capabilityCheck\s*===\s*"allowed"\s*\?\s*""\s*:\s*"text-destructive"/.test(
        src,
      ),
    ).toBe(true);
  });

  it("hard-rule compliance — no forbidden imports on touched manifest paths", () => {
    const src = readFileSync(manifest, "utf8");
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
    expect(/credential-resolver/.test(src)).toBe(false);
    expect(/dispatchMcpToolCall/.test(src)).toBe(false);
    expect(/neo4j-driver/.test(src)).toBe(false);
  });
});
