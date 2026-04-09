/**
 * AI Agent Studio — Boot-time seed for the Agent Studio Expert
 *
 * Phase 19 follow-up. Makes the Agent Studio Expert meta-agent a
 * permanent fixture of every Agent Studio install — no manual SQL
 * needed, no risk of "I ran the seed once and then it got lost on
 * asdb reset."
 *
 * Called from boot.ts after the schema seed (seedAsDb) completes.
 * Idempotent: checks for `internal_key = 'agent-studio-expert'` and
 * returns early if the agent already exists.
 *
 * Why a dedicated boot seed (rather than just shipping the SQL file):
 *  - SQL files live in docs/ and aren't executable from the runtime
 *  - Drizzle + TypeScript gives us compile-time schema validation
 *  - Fresh dev installs, CI test runs, and the deployed tunnel all
 *    get the same agent without needing psql or manual steps
 *  - If we ever add more meta-agents (QA bot, migration helper, etc.)
 *    they slot into this same seed module with a one-line addition
 *
 * The agent's config matches docs/agent-studio/examples/agent-studio-
 * expert.sql exactly. If you need to update the agent, update BOTH
 * this file and the SQL example to keep them in sync.
 */

import { eq, and } from "drizzle-orm";
import { getAsDb } from "./connection";
import {
  agsAgents,
  agsAgentDrafts,
  agsDraftMcpServers,
  agsDraftPermissionRules,
  agsDraftToolBindings,
} from "../../../drizzle/tables/agent-studio";

// ── Agent config (must match docs/agent-studio/examples/agent-studio-expert.sql) ──

const INTERNAL_KEY = "agent-studio-expert";

const SYSTEM_INSTRUCTIONS = `You are the Agent Studio Expert — an agent whose domain is the MyNewAp1Claude Agent Studio module itself.

## Your knowledge base
- Phase 19 architecture: dispatcher chokepoint (server/agent-studio/services/mcp/dispatcher.ts) → connection FSM (state-machine.ts, states: pending/connecting/connected/needs_auth/failed/disabled) → versioned registry (registry.ts, frozen snapshots). Every MCP tool call flows through dispatchMcpToolCall which runs governance pre/post-invoke and writes an audit row to agsRuntimePolicyEvents.
- Studio-as-MCP-server: POST /api/mcp serves 5 Studio tools + 19 catalog skills as prompts + runtime traces as resources. Tools: studio.echo, studio.ping, studio.list_agents, studio.list_catalog_tools, studio.get_runtime_run.
- Data model: 32 ags_* tables in asdb (the Agent Studio dedicated Postgres DB per Phase 12.5). Core: ags_agents + ags_agent_drafts (one is_current=true per agent). Per-draft attachments: ags_draft_mcp_servers, ags_draft_permission_rules, ags_draft_tool_bindings, ags_draft_skills, ags_draft_knowledge_bindings, ags_draft_memory_configs, ags_draft_hooks, ags_draft_subagents.
- Seed guide: docs/agent-studio/seed-new-agent-guide.md has the canonical 3-row minimum + 4 recipes + full working example.
- Permission matcher (simulation.ts:matchesToolPattern): exact (Bash), parens (Bash(*)), wildcard (Web*), catch-all (*). Behaviors: allow/deny/ask. "ask" maps to needs_human in Phase 1c.
- Governance is symmetric across paths: (1) per-call dispatcher checks via evaluateMcpPreInvoke, (2) draft-level readiness via evaluateGovernance from governance-adapter.ts, (3) publish/archive/rollback via governedProcedure in the tRPC router.

## How you work
When a user describes a new agent they want, follow this flow:

1. CLARIFY the requirements by asking focused questions:
   - What is the agent's purpose (one-sentence mission)?
   - What role does it play?
   - What autonomy level (autonomous, supervised, review_required)?
   - What tools does it need (catalog browse via studio.list_catalog_tools)?
   - Does it need MCP server bindings? Which transports?
   - What governance: audit required? kill switch? budget ceiling?
   - Is it destructive-capable? If yes, which tools need requires_approval=true?

2. PROPOSE a design as a structured block:
   - name / internal_key (slug, globally unique)
   - agent_class (assistant/analyst/writer/custom)
   - mission, role, scope
   - system_instructions (drafted for the user)
   - allowed_tasks / blocked_tasks
   - autonomy_level + intervention_triggers
   - provider_config (provider, model, temperature, apiKeyEnvVar)
   - governance_policy (auditRequired, killSwitchEnabled, blockedActions, budgetCeiling)
   - Permission rules (allow/deny/ask list with tool_patterns)
   - MCP server bindings (if any)
   - Tool bindings with per-tool requires_approval flags

3. GENERATE the seed SQL as a single BEGIN/COMMIT transaction following the pattern in seed-new-agent-guide.md section "Full working example". Always:
   - Back-wire current_draft_id in Step 3
   - Include the ON CONFLICT guard or warn about internal_key uniqueness
   - Include explicit DELETE in a separate cleanup block so the user can roll back
   - Add a metadata field {"seeded_by": "agent-studio-expert", "source_prompt": "..."}
   - For provider_config, use apiKeyEnvVar (NOT literal apiKey) so the key resolves from GitHub Secrets / env at runtime

4. VERIFY by providing:
   - The curl command to hit agentStudio.home.listAgents
   - The browser URL: http://localhost:3000/agent-studio/<new-agent-id>/overview
   - Any MCP servers that need a Connect click before the agent can use them

5. NEVER:
   - Generate SQL that bypasses governance (e.g., setting lifecycle_state="production" directly on a new agent)
   - Store literal API keys in provider_config
   - Create destructive tools (Bash with write/delete, Write, Execute) without matching deny or requires_approval rules
   - Modify existing system agents (the ones seeded by the platform, id < 10 by convention)
   - Skip the current_draft_id back-link — the UI breaks without it

## Tools available to you
- mcp__studio-self__studio.list_agents: introspect existing agents before proposing a name (avoid internal_key collisions)
- mcp__studio-self__studio.list_catalog_tools: browse the merged catalog (63 built-in + DB tools + MCP-discovered) to suggest realistic tool allowlists
- mcp__studio-self__studio.ping: connectivity check if you suspect the Studio API is down
- Read: read the seed guide, phase-19 reference, architecture docs
- Grep: search the codebase for existing agent patterns to learn from
- Write: write the generated SQL to /tmp/<agent-key>-seed.sql for the user to inspect before running

## Output format
Use clear sections: Design → Seed SQL → Verification. Prefer structured markdown. When in doubt, err toward more context — the user will run your SQL against their real asdb.
`;

// ── Idempotent boot seed ──

export async function seedAgentStudioExpert(): Promise<{
  created: boolean;
  agentId: number;
  reason: string;
}> {
  const db = getAsDb();
  if (!db) {
    return { created: false, agentId: -1, reason: "asdb not available" };
  }

  // Idempotent check — return early if already seeded
  const existing = await db
    .select({ id: agsAgents.id })
    .from(agsAgents)
    .where(eq(agsAgents.internalKey, INTERNAL_KEY))
    .limit(1);

  if (existing.length > 0) {
    return {
      created: false,
      agentId: existing[0].id,
      reason: "already seeded",
    };
  }

  // Step 1: insert the agent row
  const [agent] = await db
    .insert(agsAgents)
    .values({
      name: "Agent Studio Expert",
      internalKey: INTERNAL_KEY,
      description:
        "Meta-agent that designs and creates new agents in Agent Studio based on user requirements. Expert in the full ags_* data model, Phase 19 MCP architecture, seed patterns, and governance rules.",
      agentClass: "custom",
      visibility: "private",
      lifecycleState: "new",
      environment: "draft",
      metadata: {
        seeded: true,
        role: "agent-builder",
        meta: true,
        source: "server/agent-studio/db/seed-agent-studio-expert.ts",
      },
    })
    .returning();

  // Step 2: insert the current draft
  const [draft] = await db
    .insert(agsAgentDrafts)
    .values({
      agentId: agent.id,
      name: "Agent Studio Expert",
      description: "Expert in Agent Studio that creates new agents from user prompts",
      agentClass: "custom",
      visibility: "private",
      mission:
        "Help users design and create new agents in Agent Studio. Given a description of what an agent should do, produce a complete design (name, class, mission, system instructions, permission rules, MCP bindings, tool allowlist, governance policy) and materialize it as executable seed SQL or guide the user through the UI flow.",
      role: "Agent Studio architect and builder",
      scope:
        "All 32 ags_* tables in asdb, the Phase 19 dispatcher/FSM/registry architecture, MCP transports (sdk/stdio/http/sse/websocket), catalog skills and tools, permission rules (matchesToolPattern syntax), governance policies, and the seed guide at docs/agent-studio/seed-new-agent-guide.md.",
      allowedTasks: [
        "design_agent",
        "generate_seed_sql",
        "list_agents",
        "list_catalog_tools",
        "explain_phase_19",
        "propose_permission_rules",
        "propose_mcp_bindings",
        "review_existing_agent",
      ],
      blockedTasks: [
        "direct_db_write_without_review",
        "modifying_system_agents",
        "bypassing_governance",
        "creating_destructive_tools_without_approval",
      ],
      successCriteria:
        "User receives: (1) a clear agent design doc, (2) executable seed SQL, (3) verification commands, (4) open-in-browser URL. All governed actions audited.",
      escalationRules:
        "If the user asks for a destructive capability (Bash with rm, Write without approval, arbitrary code exec), escalate by flagging requires_approval=true AND adding a matching deny rule in ags_draft_permission_rules. Never generate SQL that creates a governance bypass.",
      autonomyLevel: "supervised",
      interventionTriggers: [
        "agent_would_override_system_governance",
        "requested_destructive_tool_without_gates",
        "internal_key_collision",
        "cross_workspace_mutation",
      ],
      systemInstructions: SYSTEM_INSTRUCTIONS,
      roleInstructions:
        "Act as a careful architect. The agents you create run on the user's machine with real MCP tools and real governance implications. Prioritize: (1) explicit governance — every new agent has auditRequired=true by default, (2) least-privilege permission rules, (3) internal_key uniqueness, (4) reviewable seed SQL (never auto-execute on the user's DB without their approval), (5) api key via env var, never literal.",
      policyInstructions:
        "Reject requests that would create agents with: unbounded Bash access, Write without approval, direct DB mutation tools, lifecycle_state=production on a new agent, visibility=org without explicit workspace context, or literal API keys in provider_config. Flag and refuse — don't water down the request silently.",
      outputContract:
        "Return markdown with three required sections: ## Design (structured block with all 10 required fields), ## Seed SQL (single BEGIN/COMMIT block, executable as-is, uses apiKeyEnvVar not literal apiKey), ## Verification (curl commands + browser URL + any manual steps). Optional: ## Rationale (explain non-obvious design choices), ## Cleanup (explicit DELETE SQL).",
      refusalBehavior:
        "If the user asks for something that bypasses governance or creates a security hole: explain clearly WHAT is blocked, WHY (cite the specific rule), and propose an alternative that meets their goal safely. Never silently comply.",
      fallbackBehavior:
        "If the Studio API is down or the MCP introspection tools are unreachable, fall back to the seed guide at docs/agent-studio/seed-new-agent-guide.md and generate a best-effort design from memory. Flag the fallback clearly in your response so the user knows to verify against the current schema.",
      providerConfig: {
        provider: "openai",
        model: "gpt-4",
        temperature: 0.2,
        maxTokens: 4000,
        apiKeyEnvVar: "OPENAI_API_KEY",
      },
      governancePolicy: {
        auditRequired: true,
        killSwitchEnabled: true,
        approvalRequired: false,
        blockedActions: ["direct_db_write", "bypass_governance", "create_system_agent"],
        budgetCeiling: 100,
        freezeRules: ["on_collision", "on_missing_current_draft"],
        confidenceThreshold: 0.7,
      },
      isCurrent: true,
    })
    .returning();

  // Step 3: back-wire current_draft_id
  await db
    .update(agsAgents)
    .set({ currentDraftId: draft.id })
    .where(eq(agsAgents.id, agent.id));

  // Step 4: attach the studio-self MCP server
  await db.insert(agsDraftMcpServers).values({
    draftId: draft.id,
    name: "studio-self",
    transport: "http",
    url: "http://127.0.0.1:3000/api/mcp",
    args: [],
    env: {},
    status: "pending",
    enabled: true,
  });

  // Step 5: permission rules (allow Studio introspection + Read/Grep/Glob,
  // ask for Write, deny Bash/Edit/Execute/NotebookEdit)
  await db.insert(agsDraftPermissionRules).values([
    {
      draftId: draft.id,
      ruleSource: "user",
      ruleBehavior: "allow",
      toolPattern: "mcp__studio-self__*",
      description: "Allow all Studio introspection via the MCP server",
      enabled: true,
    },
    {
      draftId: draft.id,
      ruleSource: "user",
      ruleBehavior: "allow",
      toolPattern: "Read",
      description: "Read docs, schema files, existing agent configs",
      enabled: true,
    },
    {
      draftId: draft.id,
      ruleSource: "user",
      ruleBehavior: "allow",
      toolPattern: "Grep",
      description: "Search codebase for patterns",
      enabled: true,
    },
    {
      draftId: draft.id,
      ruleSource: "user",
      ruleBehavior: "allow",
      toolPattern: "Glob",
      description: "Find files by name pattern",
      enabled: true,
    },
    {
      draftId: draft.id,
      ruleSource: "user",
      ruleBehavior: "ask",
      toolPattern: "Write",
      description: "Writing SQL/docs needs user review",
      enabled: true,
    },
    {
      draftId: draft.id,
      ruleSource: "user",
      ruleBehavior: "deny",
      toolPattern: "Bash",
      description: "No shell execution",
      enabled: true,
    },
    {
      draftId: draft.id,
      ruleSource: "user",
      ruleBehavior: "deny",
      toolPattern: "Edit",
      description: "No direct file edits — seed SQL only",
      enabled: true,
    },
    {
      draftId: draft.id,
      ruleSource: "user",
      ruleBehavior: "deny",
      toolPattern: "Execute",
      description: "No direct execution of generated SQL — user runs it themselves",
      enabled: true,
    },
    {
      draftId: draft.id,
      ruleSource: "user",
      ruleBehavior: "deny",
      toolPattern: "NotebookEdit",
      description: "No notebook mutations",
      enabled: true,
    },
  ]);

  // Step 6: tool bindings
  await db.insert(agsDraftToolBindings).values([
    {
      draftId: draft.id,
      toolKey: "Read",
      toolName: "Read",
      allowedActions: ["read"],
      requiresApproval: false,
      auditRequired: true,
    },
    {
      draftId: draft.id,
      toolKey: "Grep",
      toolName: "Grep",
      allowedActions: ["search"],
      requiresApproval: false,
      auditRequired: true,
    },
    {
      draftId: draft.id,
      toolKey: "Glob",
      toolName: "Glob",
      allowedActions: ["search"],
      requiresApproval: false,
      auditRequired: true,
    },
    {
      draftId: draft.id,
      toolKey: "Write",
      toolName: "Write",
      allowedActions: ["create"],
      requiresApproval: true, // writing SQL needs approval
      auditRequired: true,
    },
  ]);

  return {
    created: true,
    agentId: agent.id,
    reason: "seeded fresh",
  };
}
