/**
 * AI Agent Studio — Standalone Module Schema
 *
 * Independent table family (prefix `ags_`) for the AI Agent Studio module.
 * Stored in the main mynewap1claude database (no FKs across modules).
 *
 * Lifecycle: New → Draft → In Design → Simulated → Tested → Review Required →
 *            Blocked → Ready to Publish → Published → Deprecated → Archived
 *
 * Design principle: normalized draft tables for active editing, immutable
 * snapshots for versions/releases.
 */

import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ── Core: Agents + Drafts + Versions + Releases ─────────────────────────────

export const agsAgents = pgTable(
  "ags_agents",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    internalKey: varchar("internal_key", { length: 120 }).notNull(),
    description: text("description"),
    ownerId: integer("owner_id"),
    domain: varchar("domain", { length: 120 }),
    tags: jsonb("tags").$type<string[]>().default([]),
    agentClass: varchar("agent_class", { length: 64 }).default("assistant"),
    visibility: varchar("visibility", { length: 32 }).default("private"),
    lifecycleState: varchar("lifecycle_state", { length: 32 }).notNull().default("new"),
    environment: varchar("environment", { length: 32 }).default("draft"),
    currentDraftId: integer("current_draft_id"),
    publishedVersionId: integer("published_version_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    archivedAt: timestamp("archived_at"),
  },
  (t) => ({
    // internal_key is a stable cross-reference identifier — must be unique
    keyIdx: uniqueIndex("uniq_ags_agents_key").on(t.internalKey),
    stateIdx: index("idx_ags_agents_state").on(t.lifecycleState),
    ownerIdx: index("idx_ags_agents_owner").on(t.ownerId),
  })
);

export const agsAgentDrafts = pgTable(
  "ags_agent_drafts",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id").notNull(),
    // Identity
    name: text("name"),
    description: text("description"),
    ownerId: integer("owner_id"),
    domain: varchar("domain", { length: 120 }),
    tags: jsonb("tags").$type<string[]>().default([]),
    agentClass: varchar("agent_class", { length: 64 }),
    visibility: varchar("visibility", { length: 32 }),
    supportedEnvironments: jsonb("supported_environments").$type<string[]>().default([]),
    // Behavior contract
    mission: text("mission"),
    role: text("role"),
    scope: text("scope"),
    allowedTasks: jsonb("allowed_tasks").$type<string[]>().default([]),
    blockedTasks: jsonb("blocked_tasks").$type<string[]>().default([]),
    successCriteria: text("success_criteria"),
    escalationRules: text("escalation_rules"),
    autonomyLevel: varchar("autonomy_level", { length: 32 }).default("supervised"),
    interventionTriggers: jsonb("intervention_triggers").$type<string[]>().default([]),
    // Prompts
    systemInstructions: text("system_instructions"),
    roleInstructions: text("role_instructions"),
    policyInstructions: text("policy_instructions"),
    outputContract: text("output_contract"),
    promptExamples: jsonb("prompt_examples").$type<unknown[]>().default([]),
    fallbackBehavior: text("fallback_behavior"),
    refusalBehavior: text("refusal_behavior"),
    // Memory
    memoryConfig: jsonb("memory_config").$type<Record<string, unknown>>().default({}),
    // Knowledge config (catalog of source priorities + freshness/grounding settings)
    knowledgeConfig: jsonb("knowledge_config").$type<Record<string, unknown>>().default({}),
    // Workflow config (mode, handoff, retry, fallback, escalation)
    workflowConfig: jsonb("workflow_config").$type<Record<string, unknown>>().default({}),
    // Governance policy (blocked actions, approvals, thresholds, budgets, audit)
    governancePolicy: jsonb("governance_policy").$type<Record<string, unknown>>().default({}),
    // Runtime config
    runtimeConfig: jsonb("runtime_config").$type<Record<string, unknown>>().default({}),
    // Simulation defaults
    simulationDefaults: jsonb("simulation_defaults").$type<Record<string, unknown>>().default({}),

    // ── Phase 0a: openllm-agent2 native parity columns ──
    /** Reasoning effort: low | medium | high | max | <integer string> */
    effort: varchar("effort", { length: 32 }),
    /** Maximum agentic round-trips before stopping */
    maxTurns: integer("max_turns"),
    /** Run as a background (fire-and-forget) task when invoked */
    background: boolean("background").default(false),
    /** Auto-submitted as the first user turn when this agent is the main thread */
    initialPrompt: text("initial_prompt"),
    /** Experimental: critical reminder added to the system prompt at runtime */
    criticalSystemReminder: text("critical_system_reminder"),
    /** Permission mode (default | acceptEdits | bypassPermissions | plan | dontAsk) */
    permissionMode: varchar("permission_mode", { length: 32 }),
    /** Working directories the agent is allowed to operate in (addDirectories permission) */
    workingDirectories: jsonb("working_directories").$type<string[]>().default([]),
    /** Provider/model/apiKey runtime config — apiKey is encrypted at rest by the platform encryption helpers */
    providerConfig: jsonb("provider_config").$type<Record<string, unknown>>().default({}),
    /**
     * Phase 10: Scheduled execution config.
     * Shape: { enabled, cron, timezone, payload, lastRunAt? }
     *  - enabled: when false the scheduler skips this draft
     *  - cron: 5-field cron expression ("M H DOM MON DOW")
     *  - timezone: IANA name; defaults to UTC
     *  - payload: input passed to runSimulation()
     *  - lastRunAt: ISO timestamp of the last fire — used to dedupe within
     *    the same minute when the scheduler ticks more than once
     */
    scheduleConfig: jsonb("schedule_config").$type<Record<string, unknown>>().default({}),
    // Phase 12: Output styles / status line / themes.
    /** plain | markdown | json — how the runs page renders the response text */
    outputStyle: varchar("output_style", { length: 32 }),
    /**
     * Status line config — what to show in the runs page status strip
     * when this agent is running. Shape:
     *   { showModel, showCost, showTime, customText? }
     * Each boolean field defaults to true when missing.
     */
    statusLineConfig: jsonb("status_line_config").$type<Record<string, unknown>>().default({}),
    /** Per-agent theme: dark | light | monokai — UI hint only */
    theme: varchar("theme", { length: 32 }),

    // Bookkeeping
    isCurrent: boolean("is_current").default(true),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    agentIdx: index("idx_ags_drafts_agent").on(t.agentId),
    currentIdx: index("idx_ags_drafts_current").on(t.agentId, t.isCurrent),
  })
);

export const agsAgentVersions = pgTable(
  "ags_agent_versions",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    label: text("label"),
    summary: text("summary"),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    readinessScore: integer("readiness_score"),
    governanceVerdict: varchar("governance_verdict", { length: 16 }),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    agentIdx: index("idx_ags_versions_agent").on(t.agentId),
    // Enforce one version-number per agent — prevents race conditions in
    // version creation from producing duplicate version numbers.
    numberIdx: uniqueIndex("uniq_ags_versions_number").on(t.agentId, t.versionNumber),
  })
);

export const agsAgentReleases = pgTable(
  "ags_agent_releases",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id").notNull(),
    versionId: integer("version_id").notNull(),
    targetEnvironment: varchar("target_environment", { length: 32 }).notNull(),
    state: varchar("state", { length: 32 }).notNull().default("pending"),
    releaseNotes: text("release_notes"),
    approvalStateJson: jsonb("approval_state").$type<Record<string, unknown>>().default({}),
    publishedBy: integer("published_by"),
    publishedAt: timestamp("published_at"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    agentIdx: index("idx_ags_releases_agent").on(t.agentId),
    stateIdx: index("idx_ags_releases_state").on(t.state),
  })
);

// ── Child / Config tables (draft-scoped) ────────────────────────────────────

export const agsDraftToolBindings = pgTable(
  "ags_draft_tool_bindings",
  {
    id: serial("id").primaryKey(),
    draftId: integer("draft_id").notNull(),
    toolKey: varchar("tool_key", { length: 120 }).notNull(),
    toolName: text("tool_name").notNull(),
    permissionMatrix: jsonb("permission_matrix").$type<Record<string, unknown>>().default({}),
    allowedActions: jsonb("allowed_actions").$type<string[]>().default([]),
    blockedActions: jsonb("blocked_actions").$type<string[]>().default([]),
    requiresApproval: boolean("requires_approval").default(false),
    rateLimit: jsonb("rate_limit").$type<Record<string, unknown>>().default({}),
    auditRequired: boolean("audit_required").default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    draftIdx: index("idx_ags_tools_draft").on(t.draftId),
  })
);

export const agsDraftKnowledgeBindings = pgTable(
  "ags_draft_knowledge_bindings",
  {
    id: serial("id").primaryKey(),
    draftId: integer("draft_id").notNull(),
    sourceKey: varchar("source_key", { length: 120 }).notNull(),
    sourceName: text("source_name").notNull(),
    priority: integer("priority").default(50),
    freshness: varchar("freshness", { length: 32 }).default("standard"),
    groundingMode: varchar("grounding_mode", { length: 32 }).default("hybrid"),
    retrievalDepth: integer("retrieval_depth").default(5),
    contextBudget: integer("context_budget").default(4000),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    draftIdx: index("idx_ags_knowledge_draft").on(t.draftId),
  })
);

export const agsDraftMemoryConfigs = pgTable(
  "ags_draft_memory_configs",
  {
    id: serial("id").primaryKey(),
    draftId: integer("draft_id").notNull(),
    memoryType: varchar("memory_type", { length: 32 }).notNull(),
    enabled: boolean("enabled").default(false),
    retentionDays: integer("retention_days"),
    readPermissions: jsonb("read_permissions").$type<string[]>().default([]),
    writePermissions: jsonb("write_permissions").$type<string[]>().default([]),
    deletionPolicy: varchar("deletion_policy", { length: 32 }).default("manual"),
    privacyRules: jsonb("privacy_rules").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    draftIdx: index("idx_ags_memory_draft").on(t.draftId),
  })
);

export const agsDraftWorkflowNodes = pgTable(
  "ags_draft_workflow_nodes",
  {
    id: serial("id").primaryKey(),
    draftId: integer("draft_id").notNull(),
    nodeKey: varchar("node_key", { length: 120 }).notNull(),
    nodeType: varchar("node_type", { length: 64 }).notNull(),
    label: text("label"),
    config: jsonb("config").$type<Record<string, unknown>>().default({}),
    positionX: integer("position_x").default(0),
    positionY: integer("position_y").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    draftIdx: index("idx_ags_wfnodes_draft").on(t.draftId),
  })
);

export const agsDraftWorkflowEdges = pgTable(
  "ags_draft_workflow_edges",
  {
    id: serial("id").primaryKey(),
    draftId: integer("draft_id").notNull(),
    fromNodeKey: varchar("from_node_key", { length: 120 }).notNull(),
    toNodeKey: varchar("to_node_key", { length: 120 }).notNull(),
    label: text("label"),
    condition: jsonb("condition").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    draftIdx: index("idx_ags_wfedges_draft").on(t.draftId),
  })
);

// ── Evaluation: Simulation + Testing ────────────────────────────────────────

export const agsSimulationScenarios = pgTable(
  "ags_simulation_scenarios",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    inputPayload: jsonb("input_payload").$type<Record<string, unknown>>().default({}),
    toggles: jsonb("toggles").$type<Record<string, unknown>>().default({}),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    agentIdx: index("idx_ags_simscen_agent").on(t.agentId),
  })
);

export const agsSimulationRuns = pgTable(
  "ags_simulation_runs",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id").notNull(),
    scenarioId: integer("scenario_id"),
    triggeredBy: integer("triggered_by"),
    status: varchar("status", { length: 32 }).notNull().default("queued"),
    verdict: varchar("verdict", { length: 16 }),
    summary: text("summary"),
    riskScore: integer("risk_score"),
    costEstimate: integer("cost_estimate"),
    durationMs: integer("duration_ms"),
    toggles: jsonb("toggles").$type<Record<string, unknown>>().default({}),
    output: jsonb("output").$type<Record<string, unknown>>().default({}),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    agentIdx: index("idx_ags_simruns_agent").on(t.agentId),
    statusIdx: index("idx_ags_simruns_status").on(t.status),
  })
);

export const agsSimulationRunSteps = pgTable(
  "ags_simulation_run_steps",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull(),
    stepIndex: integer("step_index").notNull(),
    stepType: varchar("step_type", { length: 64 }).notNull(),
    label: text("label"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    verdict: varchar("verdict", { length: 16 }),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    runIdx: index("idx_ags_simsteps_run").on(t.runId),
  })
);

export const agsTestSuites = pgTable(
  "ags_test_suites",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    agentIdx: index("idx_ags_testsuites_agent").on(t.agentId),
  })
);

export const agsTestCases = pgTable(
  "ags_test_cases",
  {
    id: serial("id").primaryKey(),
    suiteId: integer("suite_id").notNull(),
    name: text("name").notNull(),
    inputPayload: jsonb("input_payload").$type<Record<string, unknown>>().default({}),
    expected: jsonb("expected").$type<Record<string, unknown>>().default({}),
    assertions: jsonb("assertions").$type<unknown[]>().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    suiteIdx: index("idx_ags_testcases_suite").on(t.suiteId),
  })
);

export const agsTestRuns = pgTable(
  "ags_test_runs",
  {
    id: serial("id").primaryKey(),
    suiteId: integer("suite_id").notNull(),
    agentId: integer("agent_id").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("queued"),
    verdict: varchar("verdict", { length: 16 }),
    passedCount: integer("passed_count").default(0),
    failedCount: integer("failed_count").default(0),
    triggeredBy: integer("triggered_by"),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    suiteIdx: index("idx_ags_testruns_suite").on(t.suiteId),
    agentIdx: index("idx_ags_testruns_agent").on(t.agentId),
  })
);

export const agsTestRunResults = pgTable(
  "ags_test_run_results",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull(),
    caseId: integer("case_id").notNull(),
    verdict: varchar("verdict", { length: 16 }).notNull(),
    actual: jsonb("actual").$type<Record<string, unknown>>().default({}),
    failureMessage: text("failure_message"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    runIdx: index("idx_ags_testresults_run").on(t.runId),
  })
);

// ── Runtime / Trace tables ──────────────────────────────────────────────────

export const agsRuntimeRuns = pgTable(
  "ags_runtime_runs",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id").notNull(),
    versionId: integer("version_id"),
    environment: varchar("environment", { length: 32 }).notNull().default("draft"),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    triggeredBy: integer("triggered_by"),
    triggerType: varchar("trigger_type", { length: 64 }),
    inputPayload: jsonb("input_payload").$type<Record<string, unknown>>().default({}),
    outputPayload: jsonb("output_payload").$type<Record<string, unknown>>().default({}),
    summary: text("summary"),
    durationMs: integer("duration_ms"),
    // Phase 5: Cost / token tracking — populated from openllm-agent2's
    // {type:"done", usage} message when a live runtime run completes.
    // All nullable so existing rows + simulation-only runs work fine.
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    /** USD as numeric microcents (1_000_000 = $1.00) — int avoids float drift */
    costMicrocents: integer("cost_microcents"),
    // Phase 11: Lineage. When a run was created by /resume, this points
    // at the source run we replayed history from. When created by
    // /compact, this points at the source run we summarized.
    resumedFromRunId: integer("resumed_from_run_id"),
    compactedFromRunId: integer("compacted_from_run_id"),
    // Phase 8: Subagent hierarchy. When a run was invoked by a parent
    // agent's loop (subagent_invoke message), this points at the parent
    // run. The runs page renders children nested under their parent.
    parentRunId: integer("parent_run_id"),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    agentIdx: index("idx_ags_runtime_runs_agent").on(t.agentId),
    statusIdx: index("idx_ags_runtime_runs_status").on(t.status),
  })
);

export const agsRuntimeRunSteps = pgTable(
  "ags_runtime_run_steps",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull(),
    stepIndex: integer("step_index").notNull(),
    stepType: varchar("step_type", { length: 64 }).notNull(),
    label: text("label"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    verdict: varchar("verdict", { length: 16 }),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    runIdx: index("idx_ags_runtime_steps_run").on(t.runId),
  })
);

export const agsRuntimeToolCalls = pgTable(
  "ags_runtime_tool_calls",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull(),
    toolKey: varchar("tool_key", { length: 120 }).notNull(),
    requestPayload: jsonb("request_payload").$type<Record<string, unknown>>().default({}),
    responsePayload: jsonb("response_payload").$type<Record<string, unknown>>().default({}),
    verdict: varchar("verdict", { length: 16 }),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    runIdx: index("idx_ags_runtime_tools_run").on(t.runId),
  })
);

export const agsRuntimeMemoryEvents = pgTable(
  "ags_runtime_memory_events",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull(),
    memoryType: varchar("memory_type", { length: 32 }).notNull(),
    operation: varchar("operation", { length: 32 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    runIdx: index("idx_ags_runtime_mem_run").on(t.runId),
  })
);

export const agsRuntimePolicyEvents = pgTable(
  "ags_runtime_policy_events",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull(),
    policyKey: varchar("policy_key", { length: 120 }).notNull(),
    decision: varchar("decision", { length: 16 }).notNull(),
    reason: text("reason"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    runIdx: index("idx_ags_runtime_policy_run").on(t.runId),
  })
);

// ── Release / Approval / Audit references ───────────────────────────────────

export const agsPublishRequests = pgTable(
  "ags_publish_requests",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id").notNull(),
    versionId: integer("version_id"),
    targetEnvironment: varchar("target_environment", { length: 32 }).notNull(),
    state: varchar("state", { length: 32 }).notNull().default("pending"),
    requestedBy: integer("requested_by"),
    notes: text("notes"),
    preflight: jsonb("preflight").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    decidedAt: timestamp("decided_at"),
  },
  (t) => ({
    agentIdx: index("idx_ags_publish_agent").on(t.agentId),
    stateIdx: index("idx_ags_publish_state").on(t.state),
  })
);

export const agsApprovalSteps = pgTable(
  "ags_approval_steps",
  {
    id: serial("id").primaryKey(),
    publishRequestId: integer("publish_request_id").notNull(),
    stepOrder: integer("step_order").notNull(),
    approverRole: varchar("approver_role", { length: 64 }).notNull(),
    state: varchar("state", { length: 32 }).notNull().default("pending"),
    decidedBy: integer("decided_by"),
    decisionNote: text("decision_note"),
    decidedAt: timestamp("decided_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    requestIdx: index("idx_ags_approvals_request").on(t.publishRequestId),
  })
);

export const agsReleaseAuditRefs = pgTable(
  "ags_release_audit_refs",
  {
    id: serial("id").primaryKey(),
    releaseId: integer("release_id").notNull(),
    auditSystem: varchar("audit_system", { length: 64 }).notNull(),
    externalRef: text("external_ref").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    releaseIdx: index("idx_ags_audit_release").on(t.releaseId),
  })
);

// ── Phase 0a: openllm-agent2 native parity tables ───────────────────────────
//
// 6 new tables that bring Studio to representational parity with
// openllm-agent2's `AgentDefinition` schema. All draft-scoped (FK = draftId).
// All additive — no impact on existing rows.

/**
 * Lifecycle hooks attached to a draft. One row per (event, matcher, command).
 * Mirrors openllm-agent2's hook system (`coreSchemas.ts:355-505`) — 27
 * possible event names enumerated in `AGS_HOOK_EVENTS`.
 */
export const agsDraftHooks = pgTable(
  "ags_draft_hooks",
  {
    id: serial("id").primaryKey(),
    draftId: integer("draft_id").notNull(),
    eventName: varchar("event_name", { length: 64 }).notNull(),
    /** For PreToolUse / PostToolUse: optional tool name pattern (glob or regex). */
    matcher: text("matcher"),
    /** Shell command or hook script to invoke when the event fires. */
    command: text("command").notNull(),
    timeoutMs: integer("timeout_ms"),
    requiresApproval: boolean("requires_approval").default(false),
    enabled: boolean("enabled").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    draftIdx: index("idx_ags_hooks_draft").on(t.draftId),
    eventIdx: index("idx_ags_hooks_event").on(t.eventName),
    // Prevent duplicate (event, matcher) entries on the same draft
    uniq: uniqueIndex("uniq_ags_hooks_draft_event_matcher").on(
      t.draftId,
      t.eventName,
      t.matcher
    ),
  })
);

/**
 * MCP server bindings attached to a draft. Each row is one MCP server the
 * agent can use. Mirrors `McpServerConfigForProcessTransportSchema` and
 * supports the 4 transports (stdio | sse | http | sdk).
 */
export const agsDraftMcpServers = pgTable(
  "ags_draft_mcp_servers",
  {
    id: serial("id").primaryKey(),
    draftId: integer("draft_id").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    transport: varchar("transport", { length: 32 }).notNull(),
    /** Used for stdio + http transports */
    command: text("command"),
    args: jsonb("args").$type<string[]>().default([]),
    env: jsonb("env").$type<Record<string, string>>().default({}),
    /** Used for sse + http transports */
    url: text("url"),
    /** Last known connection status from the MCP runtime */
    status: varchar("status", { length: 32 }).default("pending"),
    enabled: boolean("enabled").default(true),
    // ── Phase 15b: OAuth (encrypted at rest) ──
    /** OAuth provider config: {authorizationUrl, tokenUrl, clientId,
     *  clientSecret?, scopes?, redirectUri?} */
    oauthConfig: jsonb("oauth_config").$type<Record<string, unknown>>(),
    /** OAuth flow state + tokens after successful exchange. Encrypted
     *  at rest via server/_core/encryption.ts. */
    oauthState: jsonb("oauth_state").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    draftIdx: index("idx_ags_mcp_draft").on(t.draftId),
    // Prevent duplicate server names on the same draft
    uniq: uniqueIndex("uniq_ags_mcp_draft_name").on(t.draftId, t.name),
  })
);

/**
 * Skills attached to a draft. Each row is one skill from a pack. The skill
 * registry itself is local-first via the skill-catalog-adapter (Phase 0c).
 * Mirrors openllm `AgentDefinition.skills` array.
 */
export const agsDraftSkills = pgTable(
  "ags_draft_skills",
  {
    id: serial("id").primaryKey(),
    draftId: integer("draft_id").notNull(),
    /** The pack the skill came from (e.g. "agents", "automation", "database") */
    packKey: varchar("pack_key", { length: 64 }).notNull(),
    /** The skill identifier within the pack (e.g. "schema-review") */
    skillKey: varchar("skill_key", { length: 120 }).notNull(),
    /** Display name */
    skillName: text("skill_name").notNull(),
    /** Tools this skill is allowed to invoke (subset of agent's tools) */
    allowedTools: jsonb("allowed_tools").$type<string[]>().default([]),
    blockedTools: jsonb("blocked_tools").$type<string[]>().default([]),
    requiresApproval: boolean("requires_approval").default(false),
    /** Optional JSON Schema for skill arguments */
    argsSchema: jsonb("args_schema").$type<Record<string, unknown>>().default({}),
    enabled: boolean("enabled").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    draftIdx: index("idx_ags_skills_draft").on(t.draftId),
    packIdx: index("idx_ags_skills_pack").on(t.packKey),
    // Prevent attaching the same skill twice to the same draft
    uniq: uniqueIndex("uniq_ags_skills_draft_pack_skill").on(
      t.draftId,
      t.packKey,
      t.skillKey
    ),
  })
);

/**
 * Subagent definitions attached to a draft. Each row is a custom subagent
 * the parent agent can launch via the Agent tool.
 * Mirrors openllm `AgentDefinitionSchema` exactly — same field shape.
 */
export const agsDraftSubagents = pgTable(
  "ags_draft_subagents",
  {
    id: serial("id").primaryKey(),
    draftId: integer("draft_id").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    /** The subagent's system prompt (required by openllm) */
    prompt: text("prompt").notNull(),
    /** Tool allow-list. If empty, inherits all tools from the parent. */
    tools: jsonb("tools").$type<string[]>().default([]),
    disallowedTools: jsonb("disallowed_tools").$type<string[]>().default([]),
    /** Model alias or full model ID. If null, inherits from parent. */
    model: text("model"),
    maxTurns: integer("max_turns"),
    background: boolean("background").default(false),
    /** Reasoning effort: low | medium | high | max | <integer string> */
    effort: varchar("effort", { length: 32 }),
    permissionMode: varchar("permission_mode", { length: 32 }),
    /** Memory scope: user | project | local */
    memory: varchar("memory", { length: 32 }),
    initialPrompt: text("initial_prompt"),
    /** Experimental: critical reminder for the subagent's system prompt */
    criticalSystemReminder: text("critical_system_reminder"),
    enabled: boolean("enabled").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    draftIdx: index("idx_ags_subagents_draft").on(t.draftId),
    // Prevent duplicate subagent names on the same draft
    uniq: uniqueIndex("uniq_ags_subagents_draft_name").on(t.draftId, t.name),
  })
);

/**
 * Plugin entries attached to a draft. Plugins are local directories that
 * bundle skills/tools/commands together. Mirrors `SdkPluginConfigSchema`.
 */
export const agsDraftPlugins = pgTable(
  "ags_draft_plugins",
  {
    id: serial("id").primaryKey(),
    draftId: integer("draft_id").notNull(),
    /** Currently only "local" is supported by openllm */
    type: varchar("type", { length: 32 }).default("local"),
    /** Absolute or relative path to the plugin directory */
    path: text("path").notNull(),
    enabled: boolean("enabled").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    draftIdx: index("idx_ags_plugins_draft").on(t.draftId),
    // Prevent attaching the same plugin path twice
    uniq: uniqueIndex("uniq_ags_plugins_draft_path").on(t.draftId, t.path),
  })
);

/**
 * Permission rules attached to a draft. Mirrors openllm's `PermissionRule`
 * with source tracking and behavior (allow | deny | ask).
 */
export const agsDraftPermissionRules = pgTable(
  "ags_draft_permission_rules",
  {
    id: serial("id").primaryKey(),
    draftId: integer("draft_id").notNull(),
    /** Where the rule originated: userSettings | projectSettings | localSettings | cliArg | session */
    ruleSource: varchar("rule_source", { length: 32 }).notNull(),
    /** allow | deny | ask */
    ruleBehavior: varchar("rule_behavior", { length: 16 }).notNull(),
    /** Tool name pattern this rule applies to (e.g. "Bash", "Bash(*)", "Read") */
    toolPattern: text("tool_pattern").notNull(),
    /** Optional content pattern for content-aware rules */
    contentPattern: text("content_pattern"),
    /** Optional human description of the rule */
    description: text("description"),
    enabled: boolean("enabled").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    draftIdx: index("idx_ags_permission_rules_draft").on(t.draftId),
    behaviorIdx: index("idx_ags_permission_rules_behavior").on(t.ruleBehavior),
  })
);

/**
 * Phase 4 — Runtime hook executions.
 *
 * Each row records a single execution of an `agsDraftHooks` row against a
 * runtime event during a live or simulated run. The simulation engine
 * (and the live runtime path) look up matching hooks at every relevant
 * lifecycle event (PreToolUse, PostToolUse, etc.), spawn the hook's
 * command as a child process, and write the result here.
 *
 * Surfaced in the runs page Hooks tab.
 */
export const agsRuntimeHookExecutions = pgTable(
  "ags_runtime_hook_executions",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull(),
    /** Source hook row id (nullable — hook might be deleted after the run) */
    hookId: integer("hook_id"),
    /** The 27 lifecycle event names from AGS_HOOK_EVENTS */
    eventName: varchar("event_name", { length: 64 }).notNull(),
    /** The matcher (tool name pattern) when the event was tool-scoped */
    matcher: text("matcher"),
    /** Command that was executed */
    command: text("command").notNull(),
    /** Process exit code — null if the spawn itself failed */
    exitCode: integer("exit_code"),
    /** Captured stdout (truncated to 4 KiB) */
    stdout: text("stdout"),
    /** Captured stderr (truncated to 4 KiB) */
    stderr: text("stderr"),
    /** Wall-clock duration in ms */
    durationMs: integer("duration_ms"),
    /** Set when the hook was killed by the timeout */
    timedOut: boolean("timed_out").default(false),
    /** Spawn-level error (e.g., "ENOENT") — separate from process stderr */
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    runIdx: index("idx_ags_runtime_hook_run").on(t.runId),
    eventIdx: index("idx_ags_runtime_hook_event").on(t.eventName),
  })
);

/**
 * Phase 3 — Interactive permission requests.
 *
 * When the live runtime adapter receives a `permission_request` from
 * openllm-agent2 and the matching `agsDraftPermissionRules` row resolves
 * to "ask", the simulation service inserts a row here and BLOCKS the run
 * by polling until status flips. The runs page surfaces pending rows in
 * a banner with Allow / Deny buttons that fire the
 * `permissions.decide` mutation.
 *
 * status flow:
 *   pending → allowed | denied | timed_out
 *
 * Timeouts are written by the same simulation poll loop when the
 * configured timeout elapses (default 5 min).
 */
export const agsPendingPermissionRequests = pgTable(
  "ags_pending_permission_requests",
  {
    id: serial("id").primaryKey(),
    runtimeRunId: integer("runtime_run_id").notNull(),
    /** Tool the agent wants to invoke (best-effort — comes from the request payload) */
    toolName: text("tool_name").notNull(),
    /** Optional human description of the operation */
    description: text("description"),
    /** Full request payload from openllm-agent2 for forensic / UI display */
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().default({}),
    /** pending | allowed | denied | timed_out */
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    /** User who decided (null while pending or for timeouts) */
    decidedBy: integer("decided_by"),
    decidedAt: timestamp("decided_at"),
    /** Reason — typically populated for denials and timeouts */
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    runIdx: index("idx_ags_pending_perm_run").on(t.runtimeRunId),
    statusIdx: index("idx_ags_pending_perm_status").on(t.status),
  })
);

/**
 * Phase 13 — Catalog: User-authored tools.
 *
 * Merged at runtime in tool-catalog-adapter.ts with the static 51
 * built-in tools and any MCP-discovered tools. Cannot override a
 * built-in (unique constraint on `key` ensures user keys don't collide
 * with static keys).
 *
 * `invocationKind` determines what's runnable:
 *   "shell"     → spawn a shell command with argv templated from input
 *   "http"      → POST JSON to a URL with headers
 *   "mcp_ref"   → proxy to an MCP server tool (serverId + toolName)
 *   "builtin"   → reserved; not user-creatable, only used by static catalog
 *
 * `inputSchema` is JSON Schema (object form) for validating invocation
 * arguments at runtime.
 */
export const agsCatalogTools = pgTable(
  "ags_catalog_tools",
  {
    id: serial("id").primaryKey(),
    /** PascalCase tool key, must NOT collide with built-in 51 */
    key: varchar("key", { length: 120 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** filesystem | compute | communication | network | search | custom */
    category: varchar("category", { length: 32 }).default("custom"),
    defaultAllowedActions: jsonb("default_allowed_actions")
      .$type<string[]>()
      .default([]),
    hardBlockedActions: jsonb("hard_blocked_actions")
      .$type<string[]>()
      .default([]),
    defaultRequiresApproval: boolean("default_requires_approval").default(false),
    destructive: boolean("destructive").default(false),
    /** shell | http | mcp_ref | builtin */
    invocationKind: varchar("invocation_kind", { length: 32 }).notNull(),
    invocationConfig: jsonb("invocation_config")
      .$type<Record<string, unknown>>()
      .default({}),
    /** JSON Schema describing the tool's input arguments */
    inputSchema: jsonb("input_schema")
      .$type<Record<string, unknown>>()
      .default({}),
    version: varchar("version", { length: 32 }),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    keyIdx: uniqueIndex("uniq_ags_catalog_tools_key").on(t.key),
    categoryIdx: index("idx_ags_catalog_tools_category").on(t.category),
  })
);

/**
 * Phase 13 — Catalog: User-authored skills.
 *
 * Merged at runtime in skill-catalog-adapter.ts with the 19 vendored
 * skills and any MCP server prompts (Phase 15). Each row mirrors the
 * .md frontmatter shape plus a `body` text column for the markdown
 * prompt template.
 *
 * `source` distinguishes how the skill arrived:
 *   "db"         → created in Catalog UI directly
 *   "imported"   → imported via Phase 13d .md file picker
 *   "vendored"   → shadow entry for the 19 read-only vendored skills
 *                  (the file-system catalog is the source of truth, but
 *                  a shadow row exists so the UI can list everything
 *                  from one place)
 *   "marketplace" → installed via Phase 14 marketplace
 *   "mcp_prompt" → bridged from an MCP server's prompts/list (Phase 15)
 */
export const agsCatalogSkills = pgTable(
  "ags_catalog_skills",
  {
    id: serial("id").primaryKey(),
    packKey: varchar("pack_key", { length: 64 }).notNull(),
    skillKey: varchar("skill_key", { length: 120 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** inline | fork — execution context */
    context: varchar("context", { length: 16 }).default("inline"),
    /** Subagent type when context = fork (e.g., general-purpose) */
    agent: varchar("agent", { length: 64 }),
    /** Optional model override: sonnet | opus | haiku */
    model: varchar("model", { length: 32 }),
    /** Tool names the LLM is allowed to call from this skill */
    allowedTools: jsonb("allowed_tools").$type<string[]>().default([]),
    /** Named arguments parsed from $ARGUMENTS — for future use */
    argNames: jsonb("arg_names").$type<string[]>().default([]),
    /** high | medium | low — model effort hint */
    effort: varchar("effort", { length: 16 }),
    /** Markdown prompt body, includes $ARGUMENTS placeholder */
    body: text("body").notNull(),
    version: varchar("version", { length: 32 }),
    /** db | imported | vendored | marketplace | mcp_prompt */
    source: varchar("source", { length: 16 }).notNull().default("db"),
    /** For imported / vendored skills, the original file path */
    sourcePath: text("source_path"),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    packSkillIdx: uniqueIndex("uniq_ags_catalog_skills_pack_key").on(
      t.packKey,
      t.skillKey
    ),
    sourceIdx: index("idx_ags_catalog_skills_source").on(t.source),
  })
);

// ── Phase 14: Marketplace (Agent Studio's own — no external links) ──────────

/**
 * Phase 14: A marketplace item is a packaged unit of catalog content
 * (skills, tools, hooks, MCP servers) that can be installed onto the
 * local catalog and optionally onto a specific agent.
 *
 * Sources:
 *   "local"      → created on this Studio instance (publish flow)
 *   "imported"   → pulled from a remote registry
 *   "published"  → created here AND submitted to a remote registry
 *
 * Content lives in `payload` as a strict-typed jsonb shape — see the
 * Phase 14b service for the union of allowed shapes per `itemType`.
 */
export const agsMarketplaceItems = pgTable(
  "ags_marketplace_items",
  {
    id: serial("id").primaryKey(),
    /** "<author>/<itemKey>" — globally unique within (itemKey, version) */
    itemKey: varchar("item_key", { length: 180 }).notNull(),
    /** "skill" | "skill_pack" | "tool" | "tool_pack" | "bundle" */
    itemType: varchar("item_type", { length: 32 }).notNull(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    author: varchar("author", { length: 120 }),
    version: varchar("version", { length: 32 }).notNull(),
    /** The full serialized payload — see services/marketplace.ts for shape */
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** Tags for search */
    tags: jsonb("tags").$type<string[]>().default([]),
    /** SHA-256 of payload for integrity + dedupe */
    contentHash: varchar("content_hash", { length: 64 }),
    /** local | imported | published */
    source: varchar("source", { length: 16 }).notNull().default("local"),
    /** Bumped on install, NOT on view */
    installCount: integer("install_count").default(0),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    keyVersionIdx: uniqueIndex("uniq_ags_marketplace_items_key_version").on(
      t.itemKey,
      t.version
    ),
    typeIdx: index("idx_ags_marketplace_items_type").on(t.itemType),
    sourceIdx: index("idx_ags_marketplace_items_source").on(t.source),
  })
);

/**
 * Curated collections of marketplace items — used for the "Featured"
 * section of the marketplace home page. The bundled official seed
 * creates one collection per skill pack so the marketplace has a
 * populated landing on day one.
 */
export const agsMarketplaceCollections = pgTable(
  "ags_marketplace_collections",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 120 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Ordered list of itemKey strings */
    itemKeys: jsonb("item_keys").$type<string[]>().default([]),
    isOfficial: boolean("is_official").default(false),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    keyIdx: uniqueIndex("uniq_ags_marketplace_collections_key").on(t.key),
  })
);

/**
 * Audit + reversal record. Every install creates one of these so we
 * can uninstall by reading createdSkillIds / createdToolIds and
 * deleting them.
 */
export const agsMarketplaceInstalls = pgTable(
  "ags_marketplace_installs",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id").notNull(),
    /** Null when this is a global "install to catalog" (not per-agent) */
    agentId: integer("agent_id"),
    /** Catalog row ids the install created — used for uninstall */
    createdSkillIds: jsonb("created_skill_ids").$type<number[]>().default([]),
    createdToolIds: jsonb("created_tool_ids").$type<number[]>().default([]),
    installedBy: integer("installed_by"),
    installedAt: timestamp("installed_at").defaultNow().notNull(),
  },
  (t) => ({
    itemIdx: index("idx_ags_marketplace_installs_item").on(t.itemId),
    agentIdx: index("idx_ags_marketplace_installs_agent").on(t.agentId),
  })
);

/**
 * Phase 19 follow-up: Chat sessions for the Agent Studio.
 *
 * A chat session is a persistent multi-turn conversation with an agent.
 * Unlike simulation runs (one-shot, dry-run behavior analysis), chat
 * sessions accumulate message history and support ongoing dialogue.
 *
 * Scope: one agent per session. A user can have multiple parallel
 * sessions with the same agent (e.g., one for design, one for Q&A).
 *
 * Messages live in `agsChatMessages`, joined by `sessionId`.
 */
export const agsChatSessions = pgTable(
  "ags_chat_sessions",
  {
    id: serial("id").primaryKey(),
    /** Agent this session is attached to (ags_agents.id) */
    agentId: integer("agent_id").notNull(),
    /** Human-readable title, auto-generated from the first message */
    title: text("title"),
    /** Optional user id (for multi-tenant — nullable for single-user) */
    userId: integer("user_id"),
    /** Provider snapshot at session creation (for reproducibility) */
    providerSnapshot: jsonb("provider_snapshot").$type<Record<string, unknown>>().default({}),
    /** Accumulated totals across all messages in the session */
    totalInputTokens: integer("total_input_tokens").default(0),
    totalOutputTokens: integer("total_output_tokens").default(0),
    totalCostMicrocents: integer("total_cost_microcents").default(0),
    messageCount: integer("message_count").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    agentIdx: index("idx_ags_chat_sessions_agent").on(t.agentId),
    updatedIdx: index("idx_ags_chat_sessions_updated").on(t.updatedAt),
  })
);

/**
 * Phase 19 follow-up: Individual messages in a chat session.
 *
 * Each row is one message (user or assistant). Tool calls and tool
 * results can be stored as role="tool" with payload containing the
 * call/result (future extension — MVP stores user+assistant only).
 */
export const agsChatMessages = pgTable(
  "ags_chat_messages",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull(),
    /** "user" | "assistant" | "system" | "tool" */
    role: varchar("role", { length: 16 }).notNull(),
    /** Message text (or JSON stringified tool call/result) */
    content: text("content").notNull(),
    /** Optional tool metadata (name, input, output) for role=tool */
    toolPayload: jsonb("tool_payload").$type<Record<string, unknown>>(),
    /** Token counts for this message (assistant messages only) */
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    /** Cost in microcents ($0.000001 units) for this message */
    costMicrocents: integer("cost_microcents"),
    /** Model used for this message (assistant only) — e.g., "gpt-4" */
    model: varchar("model", { length: 64 }),
    /** Wall-clock latency for the LLM call (assistant only) */
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    sessionIdx: index("idx_ags_chat_messages_session").on(t.sessionId),
    createdIdx: index("idx_ags_chat_messages_created").on(t.createdAt),
  })
);
