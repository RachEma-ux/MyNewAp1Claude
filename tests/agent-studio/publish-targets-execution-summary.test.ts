/**
 * Publish-targets per-target execution summary — PR-V1-188.
 *
 * Source-scan covering:
 *   - `getPublishTargetExecutionSummaries()` with count + filter
 *     aggregation across the closed status taxonomy (succeeded /
 *     pending / failed) + zero-fill.
 *   - `agentStudio.publishTargets.executionSummaries` admin query.
 *   - UI joining the summary into the registry table by targetId
 *     with the `total (s/p/f)` display + invalidation on setEnabled.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-188 — publish-targets per-target execution summary", () => {
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

  it("service exports getPublishTargetExecutionSummaries + interface", () => {
    const src = readFileSync(queries, "utf8");
    expect(
      /export\s+async\s+function\s+getPublishTargetExecutionSummaries/.test(
        src,
      ),
    ).toBe(true);
    expect(
      /export\s+interface\s+PublishTargetExecutionSummary/.test(src),
    ).toBe(true);
    // 6 fields.
    expect(/targetId:\s*number/.test(src)).toBe(true);
    expect(/totalExecutions:\s*number/.test(src)).toBe(true);
    expect(/succeededCount:\s*number/.test(src)).toBe(true);
    expect(/pendingCount:\s*number/.test(src)).toBe(true);
    expect(/failedCount:\s*number/.test(src)).toBe(true);
    expect(/lastExecutedAt:\s*Date\s*\|\s*null/.test(src)).toBe(true);
  });

  it("aggregation uses count(*) filter on each status + groupBy + zero-fill", () => {
    const src = readFileSync(queries, "utf8");
    const body = src.slice(
      src.indexOf(
        "export async function getPublishTargetExecutionSummaries",
      ),
      src.indexOf("export async function setPublishTargetEnabled"),
    );
    // Aggregate filters: 'succeeded', 'pending', 'failed' from the
    // closed PUBLISH_EXECUTION_STATUSES taxonomy.
    expect(/count\(\*\)/.test(body)).toBe(true);
    expect(/filter\s+\(where[\s\S]{0,200}'succeeded'/.test(body)).toBe(true);
    expect(/filter\s+\(where[\s\S]{0,200}'pending'/.test(body)).toBe(true);
    expect(/filter\s+\(where[\s\S]{0,200}'failed'/.test(body)).toBe(true);
    expect(/\.groupBy\(/.test(body)).toBe(true);
    // Zero-fill: pre-fetch registry targetIds, then .map fill from
    // the by-id map.
    expect(/byTargetId\.get\(id\)\s*\?\?/.test(body)).toBe(true);
  });

  it("admin router exposes executionSummaries as adminProcedure.query", () => {
    const src = readFileSync(router, "utf8");
    expect(src).toContain("executionSummaries");
    expect(
      /executionSummaries:\s*adminProcedure\.query\(/.test(src),
    ).toBe(true);
    expect(src).toContain("getPublishTargetExecutionSummaries()");
  });

  it("barrel re-exports the function + summary type", () => {
    const src = readFileSync(barrel, "utf8");
    expect(src).toContain("getPublishTargetExecutionSummaries");
    expect(src).toContain("PublishTargetExecutionSummary");
  });

  it("UI joins the summary into the registry table + invalidates with setEnabled", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      "trpc.agentStudio.publishTargets.executionSummaries.useQuery",
    );
    expect(/summaryByTargetId\.set\(s\.targetId/.test(src)).toBe(true);
    expect(src).toContain("publish-target-executions-");
    // Display shape: total (succeeded/pending/failed).
    expect(
      /\$\{s\.totalExecutions\}\s*\(\$\{s\.succeededCount\}\/\$\{s\.pendingCount\}\/\$\{s\.failedCount\}\)/.test(
        src,
      ),
    ).toBe(true);
    // setEnabled success invalidates BOTH listTargets AND
    // executionSummaries.
    expect(
      /utils\.agentStudio\.publishTargets\.executionSummaries\.invalidate/.test(
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
