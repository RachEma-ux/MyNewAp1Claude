/**
 * Extensions invocation-summary surface — PR-V1-181.
 *
 * Source-scan that the new
 * `agentStudio.extensions.workspaceInvocationSummaries` query is
 * wired through service / barrel / router / UI panel, and that the
 * aggregation is the agreed shape (total / allowed / denied /
 * lastInvokedAt; zero-filled per extension).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-181 — extensions invocation summary surface", () => {
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

  it("manifest exports getInvocationSummariesByWorkspace + summary interface", () => {
    const src = readFileSync(manifest, "utf8");
    expect(
      /export\s+async\s+function\s+getInvocationSummariesByWorkspace/.test(src),
    ).toBe(true);
    expect(/export\s+interface\s+ExtensionInvocationSummary/.test(src)).toBe(
      true,
    );
    // The 4 fields the UI relies on.
    expect(/totalInvocations:\s*number/.test(src)).toBe(true);
    expect(/allowedCount:\s*number/.test(src)).toBe(true);
    expect(/deniedCount:\s*number/.test(src)).toBe(true);
    expect(/lastInvokedAt:\s*Date\s*\|\s*null/.test(src)).toBe(true);
  });

  it("manifest aggregation uses count + filter on capabilityCheck = 'allowed'", () => {
    const src = readFileSync(manifest, "utf8");
    const body = src.slice(
      src.indexOf("export async function getInvocationSummariesByWorkspace"),
      src.indexOf("export async function listExtensionsByWorkspace"),
    );
    // Pulls workspace's installed extensionIds first to drive the
    // zero-fill behavior.
    expect(body).toContain("agsExtensions");
    expect(/inArray\(\s*agsExtensionInvocations\.extensionId/.test(body)).toBe(
      true,
    );
    expect(/count\(\*\)/.test(body)).toBe(true);
    expect(/filter\s+\(where\s+/.test(body)).toBe(true);
    expect(/capabilityCheck/.test(body)).toBe(true);
    expect(/'allowed'/.test(body)).toBe(true);
    expect(/max\(/.test(body)).toBe(true);
    // Zero-fill comment + behavior.
    expect(/Zero-fill/.test(body)).toBe(true);
  });

  it("barrel re-exports the function + summary type", () => {
    const src = readFileSync(barrel, "utf8");
    expect(src).toContain("getInvocationSummariesByWorkspace");
    expect(src).toContain("ExtensionInvocationSummary");
  });

  it("router exposes workspaceInvocationSummaries as adminProcedure.query", () => {
    const src = readFileSync(router, "utf8");
    expect(src).toContain("workspaceInvocationSummaries");
    expect(
      /workspaceInvocationSummaries:\s*adminProcedure[\s\S]{0,400}\.query\(/.test(
        src,
      ),
    ).toBe(true);
    expect(
      /getInvocationSummariesByWorkspace\(input\.workspaceId\)/.test(src),
    ).toBe(true);
  });

  it("UI panel consumes the summary query and renders inline counts", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      "trpc.agentStudio.extensions.workspaceInvocationSummaries.useQuery",
    );
    // Map join by extensionId.
    expect(/summaryByExtId\.set\(s\.extensionId/.test(src)).toBe(true);
    // Inline cell uses the testid + total (allowed/denied) shape.
    expect(/extension-row-invocations-\$\{ext\.id\}/.test(src)).toBe(true);
    expect(
      /\$\{s\.totalInvocations\}\s*\(\$\{s\.allowedCount\}\/\$\{s\.deniedCount\}\)/.test(
        src,
      ),
    ).toBe(true);
    // Refresh invalidation includes the new query.
    expect(
      /utils\.agentStudio\.extensions\.workspaceInvocationSummaries\.invalidate/.test(
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
