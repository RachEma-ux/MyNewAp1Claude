/**
 * Publish-targets per-target config drill-down — PR-V1-193.
 *
 * Source-scan that the registry row now has a "view config"
 * toggle that fetches the full target (including `config` JSON)
 * on demand. Same on-demand pattern as the per-execution detail
 * (#940).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-193 — publish-targets per-target config view", () => {
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

  it("service exports getPublishTargetById + PublishTargetWithConfig", () => {
    const src = readFileSync(queries, "utf8");
    expect(/export\s+async\s+function\s+getPublishTargetById/.test(src)).toBe(
      true,
    );
    expect(/export\s+interface\s+PublishTargetWithConfig/.test(src)).toBe(true);
    expect(/extends\s+PublishTargetSummary/.test(src)).toBe(true);
    expect(/config:\s*Record<string,\s*unknown>\s*\|\s*null/.test(src)).toBe(
      true,
    );
    expect(/Promise<PublishTargetWithConfig\s*\|\s*null>/.test(src)).toBe(true);
  });

  it("admin router exposes getTargetById as adminProcedure.query", () => {
    const src = readFileSync(router, "utf8");
    expect(src).toContain("getTargetById");
    expect(/getTargetById:\s*adminProcedure[\s\S]{0,400}\.query\(/.test(src)).toBe(
      true,
    );
    expect(src).toContain("getPublishTargetById(input.targetId)");
  });

  it("barrel re-exports the function + with-config type", () => {
    const src = readFileSync(barrel, "utf8");
    expect(src).toContain("getPublishTargetById");
    expect(src).toContain("PublishTargetWithConfig");
  });

  it("UI per-row config view toggle uses lazy-enabled query + JSON render", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      "trpc.agentStudio.publishTargets.getTargetById.useQuery",
    );
    expect(/enabled:\s*expandedTargetId\s*!==\s*null/.test(src)).toBe(true);
    expect(src).toContain("publish-target-config-toggle-");
    expect(src).toContain("publish-target-config-row-");
    expect(
      /expandedTargetId\s*===\s*t\.id\s*\?\s*"hide config"\s*:\s*"view config"/.test(
        src,
      ),
    ).toBe(true);
    expect(
      /JSON\.stringify\(\s*targetDetailQ\.data\.config\s*\?\?\s*\{\},\s*null,\s*2\s*\)/.test(
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
