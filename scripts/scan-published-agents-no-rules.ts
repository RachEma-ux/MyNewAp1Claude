#!/usr/bin/env tsx
/**
 * scan:published-agents-no-rules
 *
 * Phase 5a (Roadmap V3) — operator-facing impact-scan script.
 * Read-only inventory of agents with `lifecycle_state = "published"`
 * and zero enabled tool permission rules.
 *
 * **Run this BEFORE flipping the Phase 5b feature flag.** Phase 5b
 * changes the runtime so that for published agents with zero enabled
 * rules, `checkAllowedTools` returns `"deny"` (fail-closed) instead
 * of the current `"skip"` (wide-open). Without an inventory, the flip
 * could break agents that operators didn't realize were running
 * tool-less by relying on the "no rules → permitted" default.
 *
 * Output is a markdown table to stdout suitable for pasting into a
 * rollout runbook or filing as a follow-up issue per affected agent.
 *
 * Usage:
 *   DATABASE_URL_ASDB=postgres://...:5432/asdb \
 *     npx tsx scripts/scan-published-agents-no-rules.ts
 *
 * Exit codes:
 *   0 — clean (no published agents need remediation)
 *   1 — connection failed (operator must fix DB access)
 *   2 — published agents found with no rules (informational; not a
 *       failure — the operator just needs to act on the listed ones
 *       before Phase 5b enforcement)
 *
 * Termux note:
 *   This script connects to ASDB (Postgres). Run on a machine with
 *   `DATABASE_URL_ASDB` set; it will NOT run as part of CI (no DB
 *   service container in run-tests.yml for the agent-studio path).
 */

import { Client } from "pg";

interface PublishedNoRulesRow {
  agentId: number;
  agentName: string;
  internalKey: string;
  currentDraftId: number | null;
  hasMcpServers: boolean;
}

function resolveAsdbUrl(): string {
  if (process.env.DATABASE_URL_ASDB) return process.env.DATABASE_URL_ASDB;
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL.replace(/\/[^/]+$/, "/asdb");
  }
  return "postgresql://localhost:5432/asdb";
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: resolveAsdbUrl() });
  try {
    await client.connect();
  } catch (e) {
    console.error(
      `[scan] Could not connect to ASDB: ${e instanceof Error ? e.message : String(e)}`,
    );
    console.error(
      `[scan] Set DATABASE_URL_ASDB or DATABASE_URL and re-run. ` +
        `Connection string used: ${resolveAsdbUrl()}`,
    );
    process.exit(1);
  }

  // Query: agents with lifecycle_state = 'published' whose current
  // draft has zero enabled permission rules. LEFT JOIN counts enabled
  // rules per draft; HAVING filters to "no rules at all" (count = 0).
  // We also flag whether the draft has any MCP servers configured —
  // an agent with NO mcp servers can't dispatch tools regardless of
  // rules, so it's not affected by Phase 5b enforcement.
  const result = await client.query<{
    agent_id: number;
    agent_name: string;
    internal_key: string;
    current_draft_id: number | null;
    has_mcp_servers: boolean;
  }>(
    `
    SELECT
      a.id AS agent_id,
      a.name AS agent_name,
      a.internal_key,
      a.current_draft_id,
      EXISTS (
        SELECT 1 FROM ags_mcp_servers s WHERE s.draft_id = a.current_draft_id AND s.enabled = true
      ) AS has_mcp_servers
    FROM ags_agents a
    WHERE a.lifecycle_state = 'published'
      AND a.archived_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM ags_draft_permission_rules r
        WHERE r.draft_id = a.current_draft_id
          AND COALESCE(r.enabled, true) = true
      )
    ORDER BY a.name;
    `,
  );

  const rows: PublishedNoRulesRow[] = result.rows.map((r) => ({
    agentId: r.agent_id,
    agentName: r.agent_name,
    internalKey: r.internal_key,
    currentDraftId: r.current_draft_id,
    hasMcpServers: r.has_mcp_servers,
  }));

  await client.end();

  // ── Markdown report ──────────────────────────────────────────────
  console.log("# Phase 5a — Published Agents With No Permission Rules");
  console.log("");
  console.log(`**Generated:** ${new Date().toISOString()}`);
  console.log(`**Total found:** ${rows.length}`);
  console.log("");

  if (rows.length === 0) {
    console.log(
      "No published agents need remediation. Phase 5b's fail-closed " +
        "enforcement can flip safely — no published agent is currently " +
        "relying on the implicit 'no rules → permitted' default.",
    );
    process.exit(0);
  }

  console.log(
    "Each row below will start receiving `deny` decisions for tool " +
      "dispatch when Phase 5b's fail-closed feature flag is enabled. " +
      "Remediate by adding explicit `allowedTools` permission rules on " +
      "the agent's current draft BEFORE the flip.",
  );
  console.log("");

  // Group by tool-risk for clearer prioritization. Today the only
  // signal we have at the agent level is `has_mcp_servers` — an agent
  // with no MCP servers can't dispatch tools regardless of rules, so
  // it's lower priority. Phase 7 will expose riskClass on the agent
  // level for a more granular split.
  const withTools = rows.filter((r) => r.hasMcpServers);
  const withoutTools = rows.filter((r) => !r.hasMcpServers);

  if (withTools.length > 0) {
    console.log("## High priority — agents with active MCP servers");
    console.log("");
    console.log(
      "These agents have at least one enabled MCP server and could " +
        "dispatch tools today. Phase 5b will deny those dispatches.",
    );
    console.log("");
    console.log("| Agent ID | Name | internal_key | Draft ID |");
    console.log("|---|---|---|---|");
    for (const r of withTools) {
      console.log(
        `| ${r.agentId} | ${r.agentName} | \`${r.internalKey}\` | ${r.currentDraftId ?? "(none)"} |`,
      );
    }
    console.log("");
  }

  if (withoutTools.length > 0) {
    console.log("## Low priority — agents without MCP servers");
    console.log("");
    console.log(
      "These agents have no enabled MCP servers, so they can't dispatch " +
        "tools regardless of permission rules. Phase 5b's flip is a " +
        "no-op for them. Listed for completeness only.",
    );
    console.log("");
    console.log("| Agent ID | Name | internal_key | Draft ID |");
    console.log("|---|---|---|---|");
    for (const r of withoutTools) {
      console.log(
        `| ${r.agentId} | ${r.agentName} | \`${r.internalKey}\` | ${r.currentDraftId ?? "(none)"} |`,
      );
    }
    console.log("");
  }

  console.log("## Remediation");
  console.log("");
  console.log(
    "For each high-priority agent, add explicit permission rules via " +
      "the Agent Studio Governance page (or directly to " +
      "`ags_draft_permission_rules`):",
  );
  console.log("");
  console.log(
    "- `read_only` tools → suggest `allow` rule with the tool pattern",
  );
  console.log(
    "- `write` / `destructive` / `code` tools → manual review + explicit `allow` per tool",
  );
  console.log(
    "- unknown-risk tools → block until classified (Phase 7 RAC adapter matrix)",
  );
  console.log("");
  console.log(
    "After remediation, re-run this script. When it reports 0 affected " +
      "agents, Phase 5b can ship safely.",
  );

  process.exit(2);
}

main().catch((err) => {
  console.error(`[scan] Unexpected error: ${err}`);
  process.exit(1);
});
