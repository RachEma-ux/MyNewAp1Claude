/**
 * Publish-targets admin surface — PR-V1-186.
 *
 * Source-scan that the new read-only operator surface is wired
 * end-to-end: service → barrel → admin router → main router mount
 * → UI panel → Shell → sidebar → manifest → routes.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-186 — publish-targets admin surface (read-only)", () => {
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
  const mainRouter = resolve(
    __dirname,
    "../../server/agent-studio/api/router.ts",
  );
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/PublishTargetsAdminPanel.tsx",
  );
  const page = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/pages/PublishTargetsAdminPage.tsx",
  );
  const shell = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/AgentStudioShell.tsx",
  );
  const sidebar = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
  );
  const manifest = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/manifest.ts",
  );
  const routes = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/routes.tsx",
  );

  it("admin queries export read-only target + executions list functions", () => {
    const src = readFileSync(queries, "utf8");
    expect(/export\s+async\s+function\s+listPublishTargets/.test(src)).toBe(
      true,
    );
    expect(
      /export\s+async\s+function\s+listRecentPublishExecutions/.test(src),
    ).toBe(true);
    expect(/export\s+interface\s+PublishTargetSummary/.test(src)).toBe(true);
    expect(/export\s+interface\s+PublishExecutionRow/.test(src)).toBe(true);
    // No db.insert / .update / .delete — read-only first slice.
    expect(/db\.insert\(/.test(src)).toBe(false);
    expect(/db\.update\(/.test(src)).toBe(false);
    expect(/db\.delete\(/.test(src)).toBe(false);
    // Executions ORDER BY createdAt DESC + limit clamp [1, 500].
    expect(/desc\(\s*agsPublishTargetExecutions\.createdAt\s*\)/.test(src)).toBe(
      true,
    );
    expect(/Math\.max\(1,\s*Math\.min\(500,/.test(src)).toBe(true);
  });

  it("admin router exposes two adminProcedure.query procedures + cap-500 limit", () => {
    const src = readFileSync(router, "utf8");
    expect(src).toContain("listTargets");
    expect(src).toContain("listRecentExecutions");
    expect(/listTargets:\s*adminProcedure\.query\(/.test(src)).toBe(true);
    expect(
      /listRecentExecutions:\s*adminProcedure[\s\S]{0,400}\.query\(/.test(src),
    ).toBe(true);
    expect(/z\.number\(\)\.int\(\)\.positive\(\)\.max\(500\)/.test(src)).toBe(
      true,
    );
    // No .mutation calls — read-only.
    expect(/\.mutation\(/.test(src)).toBe(false);
  });

  it("barrel re-exports queries + admin router", () => {
    const src = readFileSync(barrel, "utf8");
    expect(src).toContain("listPublishTargets");
    expect(src).toContain("listRecentPublishExecutions");
    expect(src).toContain("PublishTargetSummary");
    expect(src).toContain("publishTargetsAdminRouter");
  });

  it("main router mounts publishTargets at agentStudio.publishTargets", () => {
    const src = readFileSync(mainRouter, "utf8");
    expect(src).toContain("publishTargetsAdminRouter");
    expect(/publishTargets:\s*publishTargetsAdminRouter/.test(src)).toBe(true);
  });

  it("UI panel renders both tables with testids + filters", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      "trpc.agentStudio.publishTargets.listTargets.useQuery",
    );
    expect(src).toContain(
      "trpc.agentStudio.publishTargets.listRecentExecutions.useQuery",
    );
    expect(src).toContain('data-testid="publish-targets-table"');
    expect(src).toContain('data-testid="publish-targets-executions-table"');
    expect(src).toContain('id="publish-targets-filter-target"');
    expect(src).toContain('id="publish-targets-filter-status"');
  });

  it("Shell + sidebar + manifest + routes all advertise the new admin path", () => {
    const shellSrc = readFileSync(shell, "utf8");
    expect(shellSrc).toContain("/agent-studio/publish-targets-admin");
    expect(shellSrc).toContain("PublishTargetsAdminPage");

    const sidebarSrc = readFileSync(sidebar, "utf8");
    expect(sidebarSrc).toContain('"publish-targets-admin"');
    expect(sidebarSrc).toContain('label: "Publish"');
    expect(sidebarSrc).toContain("icon: Send");

    const manifestSrc = readFileSync(manifest, "utf8");
    expect(manifestSrc).toContain('"/agent-studio/publish-targets-admin"');

    const routesSrc = readFileSync(routes, "utf8");
    expect(routesSrc).toContain('"/agent-studio/publish-targets-admin"');

    const pageSrc = readFileSync(page, "utf8");
    expect(pageSrc).toContain("PublishTargetsAdminPanel");
  });

  it("hard-rule compliance on touched server-side files", () => {
    for (const f of [queries, router]) {
      const src = readFileSync(f, "utf8");
      expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
      expect(/credential-resolver/.test(src)).toBe(false);
      expect(/dispatchMcpToolCall/.test(src)).toBe(false);
      expect(/neo4j-driver/.test(src)).toBe(false);
    }
  });
});
