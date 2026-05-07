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
  real,
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
    /**
     * Plan v3 Phase 22 — export-candidate marker. Set to `now` when
     * `agentStudio.agent.publish` flips the agent to `published`.
     * Phase 25's `aiTypes.catalog.register` reads this column to find
     * Agent Studio releases that are ready to be registered in the
     * catalog WITHOUT publish itself writing to `catalog_entries`.
     * Null = not yet a catalog candidate (still in pre-publish lifecycle).
     */
    catalogReadyAt: timestamp("catalog_ready_at"),
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
    // Retrofit P9 (D-APP-EXT-1): ProposedToolCall snapshot + idempotency key
    /** Full ProposedToolCall payload (Phase 8 envelope) for audit + UI. */
    proposedToolCallJson: jsonb("proposed_tool_call_json").$type<Record<string, unknown> | null>(),
    /** SHA-256 of canonicalJson(proposedToolCallJson); idempotency key (D-APP-EXT-2). */
    proposedToolCallHash: varchar("proposed_tool_call_hash", { length: 64 }),
    /** Approval ttl per D-APP-EXT-5; null until decidedAt is set. */
    expiresAt: timestamp("expires_at"),
    /** Touched on every successful re-use of an `allowed` row. */
    lastUsedAt: timestamp("last_used_at"),
    /** Agent draft this approval is scoped to (D-APP-EXT-2 idempotency tuple). */
    agentDraftId: integer("agent_draft_id"),
  },
  (t) => ({
    runIdx: index("idx_ags_pending_perm_run").on(t.runtimeRunId),
    statusIdx: index("idx_ags_pending_perm_status").on(t.status),
    // D-APP-EXT-2: idempotent lookup by (draft, hash)
    draftHashIdx: index("idx_ags_pending_perm_draft_hash").on(
      t.agentDraftId,
      t.proposedToolCallHash,
    ),
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


/**
 * MCP hardening Phase 5.1: persisted FSM transition log. Subscribed to
 * `connection-events.onTransition` from boot.ts; capped per-server in
 * the repo helper (the worst offender is a flapping server which would
 * otherwise grow unbounded). Used by the MCP Manager UI's Connection
 * History panel and ad-hoc forensics queries.
 */
export const agsMcpTransitions = pgTable(
  "ags_mcp_transitions",
  {
    id: serial("id").primaryKey(),
    serverId: integer("server_id").notNull(),
    fromKind: varchar("from_kind", { length: 32 }).notNull(),
    toKind: varchar("to_kind", { length: 32 }).notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    /** Optional human-readable reason from the event payload */
    reason: text("reason"),
    ts: timestamp("ts").defaultNow().notNull(),
  },
  (t) => ({
    serverTsIdx: index("idx_ags_mcp_transitions_server_ts").on(
      t.serverId,
      t.ts
    ),
  })
);


// ── Plan v3 Phase 11 — Provider/Model Binding ─────────────────────────────
//
// Migration spec: docs/architecture/provider-model-binding/AGENT_STUDIO_PROVIDER_CONFIG_MIGRATION.md
//
// This table replaces the legacy `ags_agent_drafts.provider_config` jsonb
// shape (raw apiKey / apiKeyEnvVar). Columns mirror migration spec §3.1.
//
// Critical invariants:
//   - NO secret-shaped column. Credentials live exclusively in
//     `provider_secrets` (Provider Connections module). Phase 12's lint
//     enforces this on every write call site.
//   - `providerConnectionId` may be NULL only when status='legacy_unresolved'
//     OR when the provider kind is local (Ollama/llama.cpp).
//   - `legacyEnvVarHint` carries the env var NAME captured during migration,
//     never the value. It is non-secret by definition.
//
export const agsAgentProviderBindings = pgTable(
  "ags_agent_provider_bindings",
  {
    id: serial("id").primaryKey(),

    workspaceId: integer("workspace_id").notNull(),
    agentId: integer("agent_id").notNull(),
    draftId: integer("draft_id").notNull(),
    /**
     * Plan v3 §3.1 — Phase 11 ships with role values:
     *   "primary"   — the agent's chat/reasoning model (default)
     *   "tools"     — tool-calling model (Phase 11+ multi-role; reserved)
     *   "embedding" — embedding model (Phase 11+ multi-role; reserved)
     */
    role: varchar("role", { length: 32 }).notNull().default("primary"),

    providerCatalogEntryId: integer("provider_catalog_entry_id"),
    modelCatalogEntryId: integer("model_catalog_entry_id"),
    providerConnectionId: integer("provider_connection_id"),
    modelRef: varchar("model_ref", { length: 255 }).notNull(),

    /**
     * Plan v3 §3.2 — `binding_v1` | `legacy_unresolved` | `disabled` | `archived`.
     * Stored as varchar so future status values can be added without
     * a migration; the application layer enforces the enum.
     */
    status: varchar("status", { length: 32 }).notNull().default("binding_v1"),
    /**
     * Plan v3 §3.3 — `legacy_raw_api_key` | `legacy_env_var` |
     * `legacy_no_credential` | `provider_slug_unknown` | `migration_skipped` | NULL.
     */
    statusReason: varchar("status_reason", { length: 64 }),

    /**
     * Non-secret env var NAME captured during Phase 10 migration. Set ONLY
     * when statusReason='legacy_env_var'; null otherwise.
     */
    legacyEnvVarHint: varchar("legacy_env_var_hint", { length: 255 }),

    /**
     * Plan v3 Phase 15 — last successful policy validation timestamp.
     * Set every time `validateBindingPolicy()` returns ok=true. The
     * "degraded if older than 5 min" rule reads this column.
     * Null means "never validated since Phase 15 landed" → treated as
     * stale on first read.
     */
    lastValidatedAt: timestamp("last_validated_at"),

    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    draftRoleIdx: uniqueIndex("uniq_ags_agent_provider_bindings_draft_role").on(
      t.draftId,
      t.role,
    ),
    workspaceAgentIdx: index("idx_ags_agent_provider_bindings_ws_agent").on(
      t.workspaceId,
      t.agentId,
    ),
    providerConnectionIdx: index(
      "idx_ags_agent_provider_bindings_provider_connection",
    ).on(t.providerConnectionId),
    statusIdx: index("idx_ags_agent_provider_bindings_status").on(t.status),
  }),
);

export type AgsAgentProviderBinding = typeof agsAgentProviderBindings.$inferSelect;
export type InsertAgsAgentProviderBinding =
  typeof agsAgentProviderBindings.$inferInsert;

// ── Plan v3 Phase 40: catalog-sync log ──────────────────────────────────────
//
// Persisted log of `aiTypes.catalog.{registered,published,deprecated}` events
// the Agent Studio module receives from the AI Types module. Acts as the
// AS-side mirror of catalog lifecycle so:
//
//   1. The Phase 30 export-status derivation can answer "what happened to
//      this agent's catalog row" without a cross-DB join (the audit row is
//      now AS-local).
//   2. Phase 41 reconciliation can replay the latest event per
//      (agentId, catalogEntryId) to detect drift between AS and AI Types.
//
// Append-only: one row per delivered event. Subscribers in
// `services/catalog-sync-subscribers.ts` write rows; nothing else mutates
// or deletes them. The dedupe key is the `eventId` from the envelope —
// duplicate deliveries are skipped via the unique index.
export const agsCatalogSyncLog = pgTable(
  "ags_catalog_sync_log",
  {
    id: serial("id").primaryKey(),
    /** envelope.eventId — unique-indexed for dedupe across retries. */
    eventId: varchar("event_id", { length: 64 }).notNull(),
    /** "aiTypes.catalog.registered" | "aiTypes.catalog.published" | "aiTypes.catalog.deprecated". */
    eventType: varchar("event_type", { length: 64 }).notNull(),
    /** payload.catalogEntryId. */
    catalogEntryId: integer("catalog_entry_id").notNull(),
    /** payload.sourceModule (the module that initiated the catalog write). */
    sourceModule: varchar("source_module", { length: 64 }).notNull(),
    /** payload.sourceRefId — the agent id when sourceModule="agentStudio". */
    sourceRefId: integer("source_ref_id"),
    /** Mirror of payload.action ("created"|"updated") for registered events. */
    action: varchar("action", { length: 32 }),
    /** Full event payload preserved for forensic + reconciliation use. */
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    /** Wall-clock receive time at the AS subscriber. */
    receivedAt: timestamp("received_at").defaultNow().notNull(),
  },
  (t) => ({
    eventIdIdx: uniqueIndex("uniq_ags_catalog_sync_log_event_id").on(t.eventId),
    catalogEntryIdx: index("idx_ags_catalog_sync_log_catalog_entry").on(
      t.catalogEntryId,
    ),
    sourceRefIdx: index("idx_ags_catalog_sync_log_source_ref").on(t.sourceRefId),
    eventTypeIdx: index("idx_ags_catalog_sync_log_event_type").on(t.eventType),
  }),
);

export type AgsCatalogSyncLog = typeof agsCatalogSyncLog.$inferSelect;
export type InsertAgsCatalogSyncLog = typeof agsCatalogSyncLog.$inferInsert;

// ── CAG (Capability Pack) — RAC Phase 1A ─────────────────────────────────
//
// Per RAC_EXECUTION_PLAN.md Phase 1A. Two tables:
//   - agsCagCapabilityPacks: versioned packs per draft, mutable status.
//   - agsCagPackEvents: append-only event log.

export const agsCagCapabilityPacks = pgTable(
  "ags_cag_capability_packs",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    agentId: integer("agent_id").notNull(),
    agentDraftId: integer("agent_draft_id").notNull(),
    catalogEntryId: integer("catalog_entry_id"),
    packType: varchar("pack_type", { length: 50 }).notNull().default("capability_v1"),
    packVersion: integer("pack_version").notNull().default(1),
    /** 'fresh' | 'stale' | 'archived' | 'invalid' */
    status: varchar("status", { length: 32 }).notNull().default("fresh"),
    contentJson: jsonb("content_json").$type<Record<string, unknown>>().notNull(),
    compressedPrompt: text("compressed_prompt"),
    tokenEstimate: integer("token_estimate"),
    sourceManifestJson: jsonb("source_manifest_json").$type<Record<string, unknown>>().notNull(),
    sourceHashesJson: jsonb("source_hashes_json").$type<Record<string, string>>().notNull(),
    injectionPolicyJson: jsonb("injection_policy_json").$type<Record<string, unknown> | null>(),
    riskSummaryJson: jsonb("risk_summary_json").$type<Record<string, unknown> | null>(),
    // Retrofit P5 (D-CAG-RECON-2): Cache-Augmented + governance metadata
    /** SHA-256 of contentJson — keys cache reuse (D-CAG-RECON-3). */
    contentHash: varchar("content_hash", { length: 64 }),
    /** SHA-256 of the rendered prompt section text (D-CAG-RECON-4). */
    compiledHash: varchar("compiled_hash", { length: 64 }),
    /** Token estimate the renderer projected (separate from runtime actual). */
    tokenBudgetEstimate: integer("token_budget_estimate"),
    /** Token estimate the runtime observed post-render. */
    tokenBudgetActual: integer("token_budget_actual"),
    /** 'ok' | 'warn' | 'error' — compile result from build/validate/render. */
    compileResult: varchar("compile_result", { length: 16 }),
    /** Warnings collected during compile (empty array when clean). */
    compileWarnings: jsonb("compile_warnings").$type<string[]>().default([]),
    /** 'cleared' | 'warn' | 'blocked' (D-CAG-RECON-5). */
    governanceVerdict: varchar("governance_verdict", { length: 16 }),
    /** Rule ids when blocked or warn. */
    governanceBlockers: jsonb("governance_blockers").$type<string[]>().default([]),
    /** Monotonic counter incremented on every chat-stream that loads the pack. */
    useCount: integer("use_count").notNull().default(0),
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
    lastUsedAt: timestamp("last_used_at"),
  },
  (t) => ({
    draftVersionIdx: uniqueIndex("uniq_ags_cag_pack_draft_version").on(
      t.agentDraftId,
      t.packVersion,
    ),
    statusIdx: index("idx_ags_cag_pack_status").on(t.status),
    wsAgentIdx: index("idx_ags_cag_pack_ws_agent").on(t.workspaceId, t.agentId),
  }),
);

export type AgsCagCapabilityPack = typeof agsCagCapabilityPacks.$inferSelect;
export type InsertAgsCagCapabilityPack = typeof agsCagCapabilityPacks.$inferInsert;

export const agsCagPackEvents = pgTable(
  "ags_cag_pack_events",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    agentDraftId: integer("agent_draft_id").notNull(),
    packId: integer("pack_id"),
    /** 'pack_created' | 'pack_marked_stale' | 'pack_archived' | 'pack_used' | 'pack_validation_failed' | ... */
    eventType: varchar("event_type", { length: 50 }).notNull(),
    /** 'info' | 'warn' | 'error' */
    eventSeverity: varchar("event_severity", { length: 20 }).notNull().default("info"),
    reason: varchar("reason", { length: 255 }),
    oldHash: varchar("old_hash", { length: 128 }),
    newHash: varchar("new_hash", { length: 128 }),
    runtimeRunId: integer("runtime_run_id"),
    actorType: varchar("actor_type", { length: 20 }),
    sourceType: varchar("source_type", { length: 50 }),
    packVersion: integer("pack_version"),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown> | null>(),
  },
  (t) => ({
    draftCreatedIdx: index("idx_ags_cag_events_draft_created").on(
      t.agentDraftId,
      t.createdAt,
    ),
    packIdx: index("idx_ags_cag_events_pack").on(t.packId),
  }),
);

export type AgsCagPackEvent = typeof agsCagPackEvents.$inferSelect;
export type InsertAgsCagPackEvent = typeof agsCagPackEvents.$inferInsert;

// ── RAC Phase 2 — Source Registry ──────────────────────────────────────────

export const agsRacProfiles = pgTable(
  "ags_rac_profiles",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    agentId: integer("agent_id").notNull(),
    agentDraftId: integer("agent_draft_id").notNull(),
    profileKey: varchar("profile_key", { length: 64 }).notNull().default("default"),
    enabled: boolean("enabled").notNull().default(true),
    /** Per-profile retrieval timeout override (D-RET-6). NULL → 3000ms default. */
    timeoutMs: integer("timeout_ms"),
    notes: text("notes"),
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    draftKeyUniq: uniqueIndex("uniq_ags_rac_profile_draft_key").on(
      t.agentDraftId,
      t.profileKey,
    ),
    wsAgentIdx: index("idx_ags_rac_profile_ws_agent").on(t.workspaceId, t.agentId),
  }),
);

export type AgsRacProfile = typeof agsRacProfiles.$inferSelect;
export type InsertAgsRacProfile = typeof agsRacProfiles.$inferInsert;

export const agsRacSources = pgTable(
  "ags_rac_sources",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    profileId: integer("profile_id").notNull(),
    /** D-RET-1 enum: cag_pack | memory | document_collection | vector_index | graph_index | workspace_context | project_context | tool_result_context | manual_context | external_connector */
    sourceType: varchar("source_type", { length: 32 }).notNull(),
    /** 'agentStudio' | 'dataAnalysis' | 'projectsSystem' | 'external' */
    ownerModule: varchar("owner_module", { length: 32 }).notNull(),
    /** ID of the owning module's record (e.g. document collection id, project id, graphrag source id). */
    externalRefId: varchar("external_ref_id", { length: 255 }),
    displayName: varchar("display_name", { length: 255 }),
    enabled: boolean("enabled").notNull().default(true),
    priority: integer("priority").notNull().default(50),
    // ── D-EMB-1: embedding binding (NULL → workspace default per D-EMB-4) ──
    embeddingProviderConnectionId: integer("embedding_provider_connection_id"),
    embeddingModelRef: varchar("embedding_model_ref", { length: 255 }),
    embeddingModelDim: integer("embedding_model_dim"),
    embeddingModelVersion: varchar("embedding_model_version", { length: 64 }),
    embeddingModelPinnedAt: timestamp("embedding_model_pinned_at"),
    // ── D-RET-2: chunk override (NULL → defaults) ─────────────────────────
    chunkSizeOverride: integer("chunk_size_override"),
    chunkOverlapOverride: integer("chunk_overlap_override"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown> | null>(),
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    profileIdx: index("idx_ags_rac_sources_profile").on(t.profileId),
    wsTypeIdx: index("idx_ags_rac_sources_ws_type").on(t.workspaceId, t.sourceType),
    priorityIdx: index("idx_ags_rac_sources_priority").on(t.profileId, t.priority),
  }),
);

export type AgsRacSource = typeof agsRacSources.$inferSelect;
export type InsertAgsRacSource = typeof agsRacSources.$inferInsert;

export const agsRacPolicies = pgTable(
  "ags_rac_policies",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    profileId: integer("profile_id").notNull(),
    // ── D-RET-5: NULL = "use canonical default" ───────────────────────────
    minScore: real("min_score"),
    maxChunks: integer("max_chunks"),
    dedupeBy: varchar("dedupe_by", { length: 32 }),
    freshnessMaxAgeDays: integer("freshness_max_age_days"),
    citationRequired: boolean("citation_required"),
    sourcePermissionFilter: varchar("source_permission_filter", { length: 64 }),
    /** 'warn' | 'block' | 'none' */
    piiPolicy: varchar("pii_policy", { length: 16 }),
    licensePolicy: varchar("license_policy", { length: 16 }),
    timeoutMs: integer("timeout_ms"),
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    profileUniq: uniqueIndex("uniq_ags_rac_policy_profile").on(t.profileId),
  }),
);

export type AgsRacPolicy = typeof agsRacPolicies.$inferSelect;
export type InsertAgsRacPolicy = typeof agsRacPolicies.$inferInsert;

export const agsRacWorkspaceEmbeddingDefault = pgTable(
  "ags_rac_workspace_embedding_default",
  {
    workspaceId: integer("workspace_id").primaryKey(),
    embeddingProviderConnectionId: integer("embedding_provider_connection_id").notNull(),
    embeddingModelRef: varchar("embedding_model_ref", { length: 255 }).notNull(),
    embeddingModelDim: integer("embedding_model_dim").notNull(),
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
);

export type AgsRacWorkspaceEmbeddingDefault =
  typeof agsRacWorkspaceEmbeddingDefault.$inferSelect;
export type InsertAgsRacWorkspaceEmbeddingDefault =
  typeof agsRacWorkspaceEmbeddingDefault.$inferInsert;

// ── RAC Phase 7 — Trace, observability, feedback ──────────────────────────

export const agsRacRuntimeTraces = pgTable(
  "ags_rac_runtime_traces",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    agentId: integer("agent_id").notNull(),
    agentDraftId: integer("agent_draft_id").notNull(),
    sessionId: integer("session_id"),
    messageId: integer("message_id"),
    actorId: integer("actor_id").notNull(),
    /** ComposerMode: 'disabled' | 'safe_degraded' | 'strict' */
    mode: varchar("mode", { length: 16 }).notNull(),
    cagPackId: integer("cag_pack_id"),
    cagPackVersion: integer("cag_pack_version"),
    retrievalEnabled: boolean("retrieval_enabled").notNull().default(false),
    /** D-RET-6: REQUIRED non-null when retrievalEnabled=true. */
    retrievalLatencyMs: integer("retrieval_latency_ms"),
    chunksReturned: integer("chunks_returned").notNull().default(0),
    chunksFiltered: integer("chunks_filtered").notNull().default(0),
    chunksIncluded: integer("chunks_included").notNull().default(0),
    truncatedByBudget: integer("truncated_by_budget").notNull().default(0),
    tokenBudgetUsed: integer("token_budget_used"),
    tokenBudgetTruncated: integer("token_budget_truncated").notNull().default(0),
    citationCoverage: real("citation_coverage"),
    /** P8 evaluation may overwrite this asynchronously. */
    groundednessScore: real("groundedness_score"),
    fallbackReason: varchar("fallback_reason", { length: 64 }),
    warningsJson: jsonb("warnings_json").$type<string[] | null>(),
    perSourceLatencyJson: jsonb("per_source_latency_json").$type<
      Record<string, number> | null
    >(),
    // Retrofit P6 (D-RAC-PLANNER): explicit planner mode + reason
    /**
     * RAC P6 explicit planner mode. One of:
     * 'no_retrieval' | 'cag_only' | 'knowledge_retrieval' |
     * 'multimodal_hybrid_retrieval' | 'tool_knowledge_retrieval' |
     * 'hybrid_cag_rag' | 'hybrid_cag_tool_knowledge' |
     * 'hybrid_cag_rag_tool_knowledge'.
     */
    plannerMode: varchar("planner_mode", { length: 48 }),
    /** Free-form reason from the planner, surfaced in trace UI. */
    plannerReason: text("planner_reason"),
    // Retrofit P5 (D-CAG-RECON-4): hash captured at compose time
    /** SHA-256 of the rendered prompt section text (D-CAG-RECON-4). */
    cagCompiledHash: varchar("cag_compiled_hash", { length: 64 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    wsAgentCreatedIdx: index("idx_ags_rac_traces_ws_agent_created").on(
      t.workspaceId,
      t.agentId,
      t.createdAt,
    ),
    messageIdx: index("idx_ags_rac_traces_message").on(t.messageId),
    sessionIdx: index("idx_ags_rac_traces_session").on(t.sessionId),
  }),
);

export type AgsRacRuntimeTrace = typeof agsRacRuntimeTraces.$inferSelect;
export type InsertAgsRacRuntimeTrace = typeof agsRacRuntimeTraces.$inferInsert;

export const agsRacContextBlocks = pgTable(
  "ags_rac_context_blocks",
  {
    id: serial("id").primaryKey(),
    traceId: integer("trace_id").notNull(),
    workspaceId: integer("workspace_id").notNull(),
    sourceId: integer("source_id").notNull(),
    sourceType: varchar("source_type", { length: 32 }).notNull(),
    sourceChunkId: varchar("source_chunk_id", { length: 255 }).notNull(),
    citation: varchar("citation", { length: 512 }),
    contentHash: varchar("content_hash", { length: 128 }).notNull(),
    score: real("score").notNull(),
    rank: integer("rank").notNull(),
    sourceLatencyMs: integer("source_latency_ms"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    traceIdx: index("idx_ags_rac_blocks_trace").on(t.traceId, t.rank),
    sourceIdx: index("idx_ags_rac_blocks_source").on(t.sourceId),
  }),
);

export type AgsRacContextBlock = typeof agsRacContextBlocks.$inferSelect;
export type InsertAgsRacContextBlock = typeof agsRacContextBlocks.$inferInsert;

export const agsRacFeedback = pgTable(
  "ags_rac_feedback",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    agentId: integer("agent_id").notNull(),
    messageId: integer("message_id").notNull(),
    traceId: integer("trace_id"),
    /** 'thumbs_up' | 'thumbs_down' */
    verdict: varchar("verdict", { length: 16 }).notNull(),
    note: text("note"),
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    messageUniq: uniqueIndex("uniq_ags_rac_feedback_message").on(t.messageId),
    wsAgentIdx: index("idx_ags_rac_feedback_ws_agent").on(t.workspaceId, t.agentId),
  }),
);

export type AgsRacFeedback = typeof agsRacFeedback.$inferSelect;
export type InsertAgsRacFeedback = typeof agsRacFeedback.$inferInsert;

// ────────────────────────────────────────────────────────────────────────────
// RETROFIT P2 — Universal Ingestion + Knowledge Base + Tool Knowledge +
//               ProposedToolCall trace
//
// Schema additions for the Agent Studio Universal KB / Universal Ingestion /
// RAC / RAG / CAG / MCP Tool-Use / Critical Approval retrofit. Locked by:
//   - docs/architecture/agent-studio-universal-data-ingestion.md (D-UI-1..6)
//   - docs/architecture/agent-studio-normalized-knowledge-unit.md (D-NKU-1..6)
//   - docs/architecture/agent-studio-proposed-tool-call.md       (D-PTC-1..6)
//
// All tables follow the existing `ags_*` prefix convention. Every row is
// workspace-scoped; cross-workspace reads are forbidden by the service layer.
// ────────────────────────────────────────────────────────────────────────────

// ── Provenance (D-UI-2 mandatory context field) ─────────────────────────────

export const agsProvenanceRecords = pgTable(
  "ags_provenance_records",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    /** Source connector that fetched the raw artifact. */
    sourceConnectorKey: varchar("source_connector_key", { length: 64 }).notNull(),
    /** Parser that turned the raw artifact into the parsed document. */
    parserKey: varchar("parser_key", { length: 64 }).notNull(),
    /** Normalizer that produced the unit. */
    normalizerKey: varchar("normalizer_key", { length: 64 }).notNull(),
    /** SHA-256 of the raw artifact bytes. */
    rawArtifactHash: varchar("raw_artifact_hash", { length: 64 }).notNull(),
    /** FK to the ingestion job that produced the unit (null for ad-hoc imports). */
    ingestionJobId: integer("ingestion_job_id"),
    /** When the raw artifact was first ingested. */
    ingestedAt: timestamp("ingested_at").defaultNow().notNull(),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown> | null>(),
  },
  (t) => ({
    wsRawHashIdx: index("idx_ags_provenance_ws_raw_hash").on(
      t.workspaceId,
      t.rawArtifactHash,
    ),
    jobIdx: index("idx_ags_provenance_job").on(t.ingestionJobId),
  }),
);

export type AgsProvenanceRecord = typeof agsProvenanceRecords.$inferSelect;
export type InsertAgsProvenanceRecord = typeof agsProvenanceRecords.$inferInsert;

// ── Ingestion artifacts (D-UI-3 raw bytes; not directly retrievable) ────────

export const agsIngestionArtifacts = pgTable(
  "ags_ingestion_artifacts",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    /** Connector that fetched the artifact. */
    sourceConnectorKey: varchar("source_connector_key", { length: 64 }).notNull(),
    /** Original URI / path. */
    sourceUri: text("source_uri"),
    /** Reported content type (best-effort). */
    contentType: varchar("content_type", { length: 128 }),
    /** SHA-256 of the artifact bytes; same value goes on provenance. */
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    /** Storage backend reference; bytes live OUT of Postgres. */
    storageRef: text("storage_ref"),
    /** Bytes count for budgeting. */
    sizeBytes: integer("size_bytes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    wsHashIdx: uniqueIndex("uniq_ags_ingestion_artifact_ws_hash").on(
      t.workspaceId,
      t.contentHash,
    ),
  }),
);

export type AgsIngestionArtifact = typeof agsIngestionArtifacts.$inferSelect;
export type InsertAgsIngestionArtifact = typeof agsIngestionArtifacts.$inferInsert;

// ── Ingestion jobs (lifecycle wrapper) ──────────────────────────────────────

export const agsIngestionJobs = pgTable(
  "ags_ingestion_jobs",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    /** Source connector that originated the job. */
    sourceConnectorKey: varchar("source_connector_key", { length: 64 }).notNull(),
    /** Optional source URI for logging. */
    sourceUri: text("source_uri"),
    /** 'pending' | 'running' | 'succeeded' | 'failed' | 'unsupported_type'. */
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    /** Reported content type. */
    contentType: varchar("content_type", { length: 128 }),
    /** Counters surfaced in the UI / audit. */
    artifactsCreated: integer("artifacts_created").notNull().default(0),
    unitsCreated: integer("units_created").notNull().default(0),
    chunksCreated: integer("chunks_created").notNull().default(0),
    extractionsCreated: integer("extractions_created").notNull().default(0),
    /** Free-form failure reason. */
    failureReason: text("failure_reason"),
    requestedBy: integer("requested_by").notNull(),
    requestedAt: timestamp("requested_at").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown> | null>(),
  },
  (t) => ({
    wsStatusIdx: index("idx_ags_ingestion_jobs_ws_status").on(
      t.workspaceId,
      t.status,
    ),
  }),
);

export type AgsIngestionJob = typeof agsIngestionJobs.$inferSelect;
export type InsertAgsIngestionJob = typeof agsIngestionJobs.$inferInsert;

// ── NormalizedKnowledgeUnit (D-NKU-2 locked shape) ──────────────────────────

export const agsKnowledgeUnits = pgTable(
  "ags_knowledge_units",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    /** FK to ags_rac_sources (the source registry from RAC P2). */
    sourceId: integer("source_id").notNull(),
    /** Hierarchical parent unit (e.g., a PDF page → child unit). */
    parentUnitId: integer("parent_unit_id"),
    /**
     * D-NKU-2: 'text' | 'markdown_section' | 'html_block' | 'json_object' |
     * 'pdf_page' | 'code_function' | 'code_class' | 'table_row' |
     * 'tool_knowledge' | 'extracted_artifact'.
     */
    unitType: varchar("unit_type", { length: 32 }).notNull(),
    /** D-NKU-3: canonical text projection (always present). */
    contentText: text("content_text").notNull(),
    /** Optional structured shape for downstream consumers (D-NKU-2). */
    contentJson: jsonb("content_json").$type<Record<string, unknown> | null>(),
    /** D-NKU-4: SHA-256 of contentText for dedupe + cache. */
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    /** Source location for citation rendering. */
    sourceLocation: jsonb("source_location").$type<{
      uri?: string | null;
      pageNumber?: number | null;
      lineRange?: { start: number; end: number } | null;
      selector?: string | null;
    } | null>(),
    /** D-UI-2 mandatory: provenance row. */
    provenanceId: integer("provenance_id").notNull(),
    /** D-UI-2 mandatory: permission scope. */
    permissionContext: jsonb("permission_context").$type<{
      inheritFromSource: boolean;
      explicitAclRef?: string | null;
    }>().notNull(),
    /** D-UI-2 mandatory: 'fresh' | 'stale' | 'expired'. */
    freshnessState: varchar("freshness_state", { length: 16 })
      .notNull()
      .default("fresh"),
    lastValidatedAt: timestamp("last_validated_at").defaultNow().notNull(),
    /** D-UI-4: 'ok' | 'warn' | 'blocked'. */
    validationStatus: varchar("validation_status", { length: 16 })
      .notNull()
      .default("ok"),
    validationResultId: integer("validation_result_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    archivedAt: timestamp("archived_at"),
  },
  (t) => ({
    wsSourceIdx: index("idx_ags_knowledge_units_ws_source").on(
      t.workspaceId,
      t.sourceId,
    ),
    contentHashIdx: index("idx_ags_knowledge_units_content_hash").on(t.contentHash),
    freshnessIdx: index("idx_ags_knowledge_units_freshness").on(t.freshnessState),
    parentIdx: index("idx_ags_knowledge_units_parent").on(t.parentUnitId),
    // Composite index for the dominant kb-router listing query shape —
    // `workspaceId [AND sourceId]` with `archived_at IS NULL` as a hot
    // filter. Drizzle's `index()` API cannot express the partial WHERE
    // clause; ASDB seed.ts creates this non-partial version. Operators
    // can apply `scripts/migrations/manual/kb-listing-partial-index.sql`
    // to upgrade it to the partial-WHERE form for archive-heavy workloads.
    activeListingIdx: index("idx_ags_knowledge_units_active_listing").on(
      t.workspaceId,
      t.sourceId,
      t.freshnessState,
    ),
  }),
);

export type AgsKnowledgeUnit = typeof agsKnowledgeUnits.$inferSelect;
export type InsertAgsKnowledgeUnit = typeof agsKnowledgeUnits.$inferInsert;

// ── Knowledge chunks (D-NKU-1 sibling table) ────────────────────────────────

export const agsKnowledgeChunks = pgTable(
  "ags_knowledge_chunks",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    unitId: integer("unit_id").notNull(),
    /** Position within the parent unit. */
    chunkIndex: integer("chunk_index").notNull().default(0),
    /** Canonical text for embedding + scoring. */
    chunkText: text("chunk_text").notNull(),
    /** SHA-256 of chunkText for dedupe. */
    chunkHash: varchar("chunk_hash", { length: 64 }).notNull(),
    /** External vector store reference (D-EMB-1 per-source binding; NOT a vector(N) column). */
    vectorStoreRef: text("vector_store_ref"),
    /** Token estimate for budget accounting. */
    tokenEstimate: integer("token_estimate"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    unitIdx: index("idx_ags_knowledge_chunks_unit").on(t.unitId, t.chunkIndex),
    wsHashIdx: index("idx_ags_knowledge_chunks_ws_hash").on(
      t.workspaceId,
      t.chunkHash,
    ),
  }),
);

export type AgsKnowledgeChunk = typeof agsKnowledgeChunks.$inferSelect;
export type InsertAgsKnowledgeChunk = typeof agsKnowledgeChunks.$inferInsert;

// ── Extraction results (D-UI-1 extractor layer output) ──────────────────────

export const agsExtractionResults = pgTable(
  "ags_extraction_results",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    /** Unit the extraction operated on. */
    unitId: integer("unit_id").notNull(),
    /** Extractor key from the in-process registry. */
    extractorKey: varchar("extractor_key", { length: 64 }).notNull(),
    /** 'code_block' | 'table' | 'url_list' | 'tool_invocation' | ... — extractor-defined. */
    extractionType: varchar("extraction_type", { length: 64 }).notNull(),
    /** Structured payload — extractor-defined shape. */
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
    /** Optional SHA-256 of the canonical payload for dedupe. */
    payloadHash: varchar("payload_hash", { length: 64 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    unitIdx: index("idx_ags_extraction_results_unit").on(t.unitId),
    typeIdx: index("idx_ags_extraction_results_type").on(t.extractionType),
  }),
);

export type AgsExtractionResult = typeof agsExtractionResults.$inferSelect;
export type InsertAgsExtractionResult = typeof agsExtractionResults.$inferInsert;

// ── Data validation results (D-UI-4) ────────────────────────────────────────

export const agsDataValidationResults = pgTable(
  "ags_data_validation_results",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    /** Unit the validation ran against. */
    unitId: integer("unit_id").notNull(),
    /** 'ok' | 'warn' | 'blocked'. */
    status: varchar("status", { length: 16 }).notNull(),
    /** Flag set when at least one rule fired. */
    findings: jsonb("findings").$type<Array<{
      rule: string;
      severity: "info" | "warn" | "block";
      message: string;
      detail?: Record<string, unknown>;
    }>>().notNull().default([]),
    /** When the validator ran. */
    validatedAt: timestamp("validated_at").defaultNow().notNull(),
    /** Validator implementation key (for audit when rules change). */
    validatorVersion: varchar("validator_version", { length: 32 }),
  },
  (t) => ({
    unitIdx: index("idx_ags_validation_unit").on(t.unitId),
    statusIdx: index("idx_ags_validation_status").on(t.status),
  }),
);

export type AgsDataValidationResult = typeof agsDataValidationResults.$inferSelect;
export type InsertAgsDataValidationResult = typeof agsDataValidationResults.$inferInsert;

// ── MCP tool knowledge mirror (Phase 7) ─────────────────────────────────────

export const agsMcpToolKnowledge = pgTable(
  "ags_mcp_tool_knowledge",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    /** Server id from agsMcpServers (canonical id, not connection id). */
    mcpServerId: varchar("mcp_server_id", { length: 128 }).notNull(),
    /** Tool name as advertised by the server. */
    toolName: varchar("tool_name", { length: 256 }).notNull(),
    /** Optional version string from the manifest. */
    toolVersion: varchar("tool_version", { length: 64 }),
    /** Snapshot of the tool's input/output schema. */
    schemaSnapshot: jsonb("schema_snapshot").$type<Record<string, unknown>>().notNull(),
    /** SHA-256 of the canonicalized schemaSnapshot. */
    schemaHash: varchar("schema_hash", { length: 64 }).notNull(),
    /** Tool description / summary as advertised. */
    description: text("description"),
    /** D-TOOL-1 8-class taxonomy as observed at sync time. */
    riskClass: varchar("risk_class", { length: 32 }).notNull(),
    /** When the tool was last seen by the sync service. */
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    /** Flipped to false when the tool disappears from the live registry. */
    available: boolean("available").notNull().default(true),
    /** Materialized as a NormalizedKnowledgeUnit; FK to ags_knowledge_units. */
    knowledgeUnitId: integer("knowledge_unit_id"),
    /** Optional approval ttl override (D-APP-EXT-5). */
    approvalTtlSeconds: integer("approval_ttl_seconds"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    wsServerToolIdx: uniqueIndex("uniq_ags_mcp_tool_knowledge_ws_server_tool").on(
      t.workspaceId,
      t.mcpServerId,
      t.toolName,
    ),
    schemaHashIdx: index("idx_ags_mcp_tool_knowledge_schema_hash").on(t.schemaHash),
    availableIdx: index("idx_ags_mcp_tool_knowledge_available").on(t.available),
  }),
);

export type AgsMcpToolKnowledge = typeof agsMcpToolKnowledge.$inferSelect;
export type InsertAgsMcpToolKnowledge = typeof agsMcpToolKnowledge.$inferInsert;

// ── ProposedToolCall trace (D-PTC-5; sibling to runtime traces) ─────────────

export const agsToolCallTraces = pgTable(
  "ags_tool_call_traces",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    /** Runtime trace this tool-call belongs to. */
    runtimeTraceId: integer("runtime_trace_id"),
    runtimeRunId: integer("runtime_run_id"),
    agentId: integer("agent_id").notNull(),
    agentDraftId: integer("agent_draft_id").notNull(),
    messageId: integer("message_id"),
    /** Full ProposedToolCall envelope (D-PTC-1). */
    proposedToolCallJson: jsonb("proposed_tool_call_json")
      .$type<Record<string, unknown>>().notNull(),
    /** Canonical hash (D-PTC-4). */
    proposedToolCallHash: varchar("proposed_tool_call_hash", { length: 64 }).notNull(),
    /** Validator verdict: 'ok' | 'rejected'. */
    validationVerdict: varchar("validation_verdict", { length: 16 }).notNull(),
    /** Validator code on rejection (one of D-PTC-2 codes). */
    validationCode: varchar("validation_code", { length: 64 }),
    /** Free-form rejection message. */
    validationMessage: text("validation_message"),
    /** Approval row id if approval was required. */
    approvalRequestId: integer("approval_request_id"),
    /** Approval status at dispatch time: 'allowed' | 'denied' | 'expired' | 'pending' | null. */
    approvalStatus: varchar("approval_status", { length: 16 }),
    /** Governance verdict from evaluateMcpPreInvoke. */
    governanceVerdict: varchar("governance_verdict", { length: 16 }),
    /** MCP dispatch result: 'ok' | 'error' | 'blocked'. */
    dispatchResult: varchar("dispatch_result", { length: 16 }),
    /** Dispatcher's audit row id (FK to agsRuntimePolicyEvents). */
    dispatchAuditId: integer("dispatch_audit_id"),
    /** Latency captured by the validator + dispatcher combined. */
    durationMs: integer("duration_ms"),
    /** Stripped-stack error message when dispatch failed. */
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    runtimeTraceIdx: index("idx_ags_tool_call_traces_runtime").on(t.runtimeTraceId),
    agentIdx: index("idx_ags_tool_call_traces_agent").on(t.workspaceId, t.agentId),
    hashIdx: index("idx_ags_tool_call_traces_hash").on(t.proposedToolCallHash),
    messageIdx: index("idx_ags_tool_call_traces_message").on(t.messageId),
  }),
);

export type AgsToolCallTrace = typeof agsToolCallTraces.$inferSelect;
export type InsertAgsToolCallTrace = typeof agsToolCallTraces.$inferInsert;
