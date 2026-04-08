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
