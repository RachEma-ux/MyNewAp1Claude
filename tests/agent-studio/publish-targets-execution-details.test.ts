/**
 * Publish-targets per-execution detail surface — PR-V1-189.
 *
 * Source-scan that the new on-demand details surface is wired:
 *   - `getPublishExecutionById(executionId)` service-layer
 *     function returning `PublishExecutionDetail` (extends row +
 *     `details: Record<string, unknown> | null`).
 *   - `agentStudio.publishTargets.getExecutionById` admin query.
 *   - UI per-row expand toggle with lazy-enabled query +
 *     `JSON.stringify(details)` rendering.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-189 — publish-targets per-execution detail surface", () => {
  const queries = resolve(
    __dirname,
    "../../server/agent-studio/services/publish-targets/admin-queries.ts",
  );
  const router = resolve(
    __dirname,
    "../../server/agent-studio/services/publish-targets/admin-router.ts",
  );
  const barrel = resolve(
    __dirname,
    "../../server/agent-studio/services/publish-targets/index.ts",
  );
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/PublishTargetsAdminPanel.tsx",
  );

  it("service exports getPublishExecutionById + PublishExecutionDetail", () => {
    const src = readFileSync(queries, "utf8");
    expect(
      /export\s+async\s+function\s+getPublishExecutionById/.test(src),
    ).toBe(true);
    expect(/export\s+interface\s+PublishExecutionDetail/.test(src)).toBe(true);
    // Detail extends row + has details JSON field.
    expect(/extends\s+PublishExecutionRow/.test(src)).toBe(true);
    expect(/details:\s*Record<string,\s*unknown>\s*\|\s*null/.test(src)).toBe(
      true,
    );
    // Returns null on no-match.
    expect(/Promise<PublishExecutionDetail\s*\|\s*null>/.test(src)).toBe(true);
  });

  it("admin router exposes getExecutionById as adminProcedure.query", () => {
    const src = readFileSync(router, "utf8");
    expect(src).toContain("getExecutionById");
    expect(
      /getExecutionById:\s*adminProcedure[\s\S]{0,400}\.query\(/.test(src),
    ).toBe(true);
    expect(src).toContain("getPublishExecutionById(input.executionId)");
    expect(/executionId:\s*z\.number\(\)\.int\(\)\.positive\(\)/.test(src)).toBe(
      true,
    );
  });

  it("barrel re-exports the function + detail type", () => {
    const src = readFileSync(barrel, "utf8");
    expect(src).toContain("getPublishExecutionById");
    expect(src).toContain("PublishExecutionDetail");
  });

  it("UI per-row expand toggle uses lazy-enabled query + renders JSON", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      "trpc.agentStudio.publishTargets.getExecutionById.useQuery",
    );
    // Lazy enablement guards against fetching when no row is open.
    expect(/enabled:\s*expandedExecutionId\s*!==\s*null/.test(src)).toBe(true);
    expect(src).toContain("publish-execution-details-toggle-");
    expect(src).toContain("publish-execution-details-row-");
    // hide/view button label flip.
    expect(/isExpanded\s*\?\s*"hide"\s*:\s*"view"/.test(src)).toBe(true);
    // JSON.stringify with 2-space indent renders the details blob.
    expect(
      /JSON\.stringify\(\s*detailQ\.data\.details\s*\?\?\s*\{\},\s*null,\s*2\s*\)/.test(
        src,
      ),
    ).toBe(true);
  });

  it("hard-rule compliance on touched service path", () => {
    const src = readFileSync(queries, "utf8");
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
    expect(/credential-resolver/.test(src)).toBe(false);
    expect(/dispatchMcpToolCall/.test(src)).toBe(false);
    expect(/neo4j-driver/.test(src)).toBe(false);
  });
});
