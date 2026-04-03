/**
 * CODEDB — Code Studio Dedicated Database Schema
 *
 * All tables for the Code Studio module's runtime state.
 * Stored in the dedicated `codedb` PostgreSQL database.
 */

import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  json,
  jsonb,
  index,
  varchar,
} from "drizzle-orm/pg-core";

// ── Group 1: Repository Registry ─────────────────────────────────────────────

export const codeRepositories = pgTable(
  "code_repositories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    defaultBranch: text("default_branch").default("main"),
    protectedBranches: jsonb("protected_branches").default([]),
    cloneMethod: varchar("clone_method", { length: 20 }).default("https"),
    isActive: boolean("is_active").default(true),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    nameIdx: index("idx_code_repos_name").on(table.name),
  })
);

export const codeRepoPolicies = pgTable(
  "code_repo_policies",
  {
    id: serial("id").primaryKey(),
    repoId: integer("repo_id").notNull(),
    policyType: varchar("policy_type", { length: 50 }).notNull(),
    rule: jsonb("rule").notNull(),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    repoIdx: index("idx_code_repo_policies_repo").on(table.repoId),
  })
);

// ── Group 2: Workspace Management ────────────────────────────────────────────

export const codeWorkspaces = pgTable(
  "code_workspaces",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull(),
    repoId: integer("repo_id").notNull(),
    workspacePath: text("workspace_path").notNull(),
    branchName: text("branch_name").notNull(),
    baselineSha: varchar("baseline_sha", { length: 40 }),
    finalSha: varchar("final_sha", { length: 40 }),
    status: varchar("status", { length: 30 }).default("active").notNull(),
    changedFiles: jsonb("changed_files").default([]),
    createdAt: timestamp("created_at").defaultNow(),
    cleanedAt: timestamp("cleaned_at"),
  },
  (table) => ({
    jobIdx: index("idx_code_workspaces_job").on(table.jobId),
    repoIdx: index("idx_code_workspaces_repo").on(table.repoId),
  })
);

export const codeWorkspaceLocks = pgTable(
  "code_workspace_locks",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    lockedBy: varchar("locked_by", { length: 100 }).notNull(),
    lockedAt: timestamp("locked_at").defaultNow(),
    expiresAt: timestamp("expires_at"),
    reason: text("reason"),
  },
  (table) => ({
    wsIdx: index("idx_code_ws_locks_ws").on(table.workspaceId),
  })
);

// ── Group 3: Coding Job Lifecycle ────────────────────────────────────────────

export const codeJobs = pgTable(
  "code_jobs",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    objective: text("objective"),
    constraints: jsonb("constraints").default({}),
    status: varchar("status", { length: 30 }).default("draft").notNull(),
    priority: varchar("priority", { length: 20 }).default("normal"),
    repoId: integer("repo_id"),
    sourceModule: varchar("source_module", { length: 50 }),
    sourceWorkflowId: varchar("source_workflow_id", { length: 100 }),
    actorUserId: integer("actor_user_id"),
    resultSummary: jsonb("result_summary"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    statusIdx: index("idx_code_jobs_status").on(table.status),
    actorIdx: index("idx_code_jobs_actor").on(table.actorUserId),
    repoIdx: index("idx_code_jobs_repo").on(table.repoId),
  })
);

export const codeJobSteps = pgTable(
  "code_job_steps",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull(),
    stepName: varchar("step_name", { length: 50 }).notNull(),
    stepOrder: integer("step_order").notNull(),
    status: varchar("status", { length: 30 }).default("pending").notNull(),
    agentRole: varchar("agent_role", { length: 50 }),
    sessionId: varchar("session_id", { length: 100 }),
    input: jsonb("input"),
    output: jsonb("output"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    jobIdx: index("idx_code_job_steps_job").on(table.jobId),
  })
);

export const codeHandoffs = pgTable(
  "code_handoffs",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull(),
    direction: varchar("direction", { length: 10 }).notNull(), // 'inbound' | 'outbound'
    sourceModule: varchar("source_module", { length: 50 }),
    payload: jsonb("payload").notNull(),
    callbackUrl: text("callback_url"),
    callbackStatus: varchar("callback_status", { length: 30 }),
    callbackPayload: jsonb("callback_payload"),
    createdAt: timestamp("created_at").defaultNow(),
    processedAt: timestamp("processed_at"),
  },
  (table) => ({
    jobIdx: index("idx_code_handoffs_job").on(table.jobId),
    dirIdx: index("idx_code_handoffs_dir").on(table.direction),
  })
);

// ── Group 4: OpenCode Runtime Tracking ───────────────────────────────────────

export const codeSessions = pgTable(
  "code_sessions",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull(),
    opencodeSessionId: varchar("opencode_session_id", { length: 200 }),
    agentRole: varchar("agent_role", { length: 50 }),
    status: varchar("status", { length: 30 }).default("active").notNull(),
    model: varchar("model", { length: 100 }),
    tokensIn: integer("tokens_in").default(0),
    tokensOut: integer("tokens_out").default(0),
    createdAt: timestamp("created_at").defaultNow(),
    closedAt: timestamp("closed_at"),
  },
  (table) => ({
    jobIdx: index("idx_code_sessions_job").on(table.jobId),
    ocIdIdx: index("idx_code_sessions_oc").on(table.opencodeSessionId),
  })
);

export const codeSessionMessages = pgTable(
  "code_session_messages",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull(),
    opencodeMessageId: varchar("opencode_message_id", { length: 200 }),
    role: varchar("role", { length: 20 }).notNull(),
    contentPreview: text("content_preview"),
    toolCalls: jsonb("tool_calls"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    sessIdx: index("idx_code_sess_msgs_sess").on(table.sessionId),
  })
);

export const codeSessionChildren = pgTable(
  "code_session_children",
  {
    id: serial("id").primaryKey(),
    parentSessionId: integer("parent_session_id").notNull(),
    childSessionId: integer("child_session_id").notNull(),
    agentRole: varchar("agent_role", { length: 50 }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    parentIdx: index("idx_code_sess_children_parent").on(table.parentSessionId),
  })
);

export const codeRunEvents = pgTable(
  "code_run_events",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull(),
    sessionId: integer("session_id"),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    eventData: jsonb("event_data").default({}),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    jobIdx: index("idx_code_run_events_job").on(table.jobId),
    typeIdx: index("idx_code_run_events_type").on(table.eventType),
  })
);

// ── Group 5: Approvals / Permissions ─────────────────────────────────────────

export const codePermissionRequests = pgTable(
  "code_permission_requests",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull(),
    sessionId: integer("session_id"),
    opencodePermissionId: varchar("opencode_permission_id", { length: 200 }),
    permissionType: varchar("permission_type", { length: 50 }).notNull(),
    toolName: varchar("tool_name", { length: 50 }),
    description: text("description"),
    riskLevel: varchar("risk_level", { length: 20 }).default("medium"),
    requestPayload: jsonb("request_payload"),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => ({
    jobIdx: index("idx_code_perm_reqs_job").on(table.jobId),
    statusIdx: index("idx_code_perm_reqs_status").on(table.status),
  })
);

export const codeApprovals = pgTable(
  "code_approvals",
  {
    id: serial("id").primaryKey(),
    permissionRequestId: integer("permission_request_id").notNull(),
    decision: varchar("decision", { length: 20 }).notNull(), // 'approved' | 'denied'
    scope: varchar("scope", { length: 30 }).default("once"), // 'once' | 'session' | 'job' | 'repo_policy'
    actorUserId: integer("actor_user_id"),
    rationale: text("rationale"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    reqIdx: index("idx_code_approvals_req").on(table.permissionRequestId),
    actorIdx: index("idx_code_approvals_actor").on(table.actorUserId),
  })
);

export const codePolicyProfiles = pgTable(
  "code_policy_profiles",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    repoId: integer("repo_id"),
    rules: jsonb("rules").notNull(),
    isDefault: boolean("is_default").default(false),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    nameIdx: index("idx_code_policy_profiles_name").on(table.name),
  })
);

// ── Group 6: Artifacts / Outputs ─────────────────────────────────────────────

export const codeDiffs = pgTable(
  "code_diffs",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull(),
    sessionId: integer("session_id"),
    filePath: text("file_path").notNull(),
    diffType: varchar("diff_type", { length: 20 }).notNull(), // 'add' | 'modify' | 'delete'
    diffContent: text("diff_content"),
    linesAdded: integer("lines_added").default(0),
    linesRemoved: integer("lines_removed").default(0),
    status: varchar("status", { length: 20 }).default("proposed"), // 'proposed' | 'approved' | 'applied' | 'reverted'
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    jobIdx: index("idx_code_diffs_job").on(table.jobId),
  })
);

export const codeArtifacts = pgTable(
  "code_artifacts",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull(),
    artifactType: varchar("artifact_type", { length: 50 }).notNull(),
    name: text("name").notNull(),
    content: text("content"),
    contentRef: text("content_ref"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    jobIdx: index("idx_code_artifacts_job").on(table.jobId),
    typeIdx: index("idx_code_artifacts_type").on(table.artifactType),
  })
);

export const codePullRequestCandidates = pgTable(
  "code_pull_request_candidates",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull(),
    repoId: integer("repo_id").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    sourceBranch: text("source_branch").notNull(),
    targetBranch: text("target_branch").notNull(),
    status: varchar("status", { length: 20 }).default("draft"), // 'draft' | 'ready' | 'submitted' | 'merged'
    externalPrUrl: text("external_pr_url"),
    diffSummary: jsonb("diff_summary"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    jobIdx: index("idx_code_pr_candidates_job").on(table.jobId),
  })
);

// ── Group 7: Audit / Operations ──────────────────────────────────────────────

export const codeAuditEvents = pgTable(
  "code_audit_events",
  {
    id: serial("id").primaryKey(),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    entityType: varchar("entity_type", { length: 30 }),
    entityId: integer("entity_id"),
    actorUserId: integer("actor_user_id"),
    details: jsonb("details").default({}),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    typeIdx: index("idx_code_audit_events_type").on(table.eventType),
    entityIdx: index("idx_code_audit_events_entity").on(table.entityType, table.entityId),
    createdIdx: index("idx_code_audit_events_created").on(table.createdAt),
  })
);

export const codeHealthSnapshots = pgTable(
  "code_health_snapshots",
  {
    id: serial("id").primaryKey(),
    opencodeHealthy: boolean("opencode_healthy"),
    codedbHealthy: boolean("codedb_healthy"),
    activeJobs: integer("active_jobs").default(0),
    activeSessions: integer("active_sessions").default(0),
    pendingApprovals: integer("pending_approvals").default(0),
    workspaceCount: integer("workspace_count").default(0),
    details: jsonb("details").default({}),
    createdAt: timestamp("created_at").defaultNow(),
  }
);

export const codeRetentionBatches = pgTable(
  "code_retention_batches",
  {
    id: serial("id").primaryKey(),
    batchType: varchar("batch_type", { length: 30 }).notNull(),
    itemsProcessed: integer("items_processed").default(0),
    itemsFailed: integer("items_failed").default(0),
    details: jsonb("details").default({}),
    startedAt: timestamp("started_at").defaultNow(),
    completedAt: timestamp("completed_at"),
  }
);

// ── Group 8: Settings (key-value store) ──────────────────────────────────

export const codeSettings = pgTable(
  "code_settings",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 100 }).notNull().unique(),
    value: jsonb("value").default({}),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    keyIdx: index("idx_code_settings_key").on(table.key),
  })
);

// ── Group 9: AI Catalog Imports ────────────────────────────────────────────

// ── Group 11: Job Templates ──────────────────────────────────────────────

export const codeJobTemplates = pgTable(
  "code_job_templates",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 50 }),
    templateType: varchar("template_type", { length: 50 }).default("general"),
    isBuiltIn: boolean("is_built_in").default(false),
    isActive: boolean("is_active").default(true),
    titleTemplate: text("title_template"),
    objectiveTemplate: text("objective_template"),
    defaultPriority: varchar("default_priority", { length: 20 }).default("normal"),
    defaultConstraints: jsonb("default_constraints").default({}),
    variableSchema: jsonb("variable_schema").default([]),
    importSource: text("import_source"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    slugIdx: index("idx_code_job_templates_slug").on(table.slug),
    builtInIdx: index("idx_code_job_templates_built_in").on(table.isBuiltIn),
    activeIdx: index("idx_code_job_templates_active").on(table.isActive),
  })
);

// ── Group 10: OpenCode Settings Profiles ─────────────────────────────────

export const codeOpencodeProfiles = pgTable(
  "code_opencode_profiles",
  {
    id: serial("id").primaryKey(),
    profileType: varchar("profile_type", { length: 20 }).notNull(), // 'runtime' | 'tui'
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    configDraft: jsonb("config_draft").default({}),
    configApplied: jsonb("config_applied"),
    status: varchar("status", { length: 20 }).default("draft").notNull(), // 'draft' | 'applied' | 'archived'
    isActive: boolean("is_active").default(true),
    appliedAt: timestamp("applied_at"),
    appliedVersion: integer("applied_version"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    typeIdx: index("idx_code_oc_profiles_type").on(table.profileType),
    activeIdx: index("idx_code_oc_profiles_active").on(table.isActive),
  })
);

export const codeOpencodeProfileVersions = pgTable(
  "code_opencode_profile_versions",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id").notNull(),
    version: integer("version").notNull(),
    config: jsonb("config").notNull(),
    changeSummary: text("change_summary"),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    profileIdx: index("idx_code_oc_pv_profile").on(table.profileId),
    versionIdx: index("idx_code_oc_pv_version").on(table.profileId, table.version),
  })
);

export const codeOpencodeApplyEvents = pgTable(
  "code_opencode_apply_events",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id").notNull(),
    profileType: varchar("profile_type", { length: 20 }).notNull(),
    version: integer("version").notNull(),
    action: varchar("action", { length: 20 }).notNull(), // 'apply' | 'revert' | 'validate' | 'preview'
    status: varchar("status", { length: 20 }).notNull(), // 'success' | 'failed' | 'pending'
    generatedConfig: jsonb("generated_config"),
    validationErrors: jsonb("validation_errors"),
    healthCheckResult: jsonb("health_check_result"),
    errorMessage: text("error_message"),
    actorUserId: integer("actor_user_id"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    profileIdx: index("idx_code_oc_apply_profile").on(table.profileId),
    typeIdx: index("idx_code_oc_apply_type").on(table.profileType),
    createdIdx: index("idx_code_oc_apply_created").on(table.createdAt),
  })
);

// ── Group 9: AI Catalog Imports ────────────────────────────────────────────

export const codeCatalogImports = pgTable(
  "code_catalog_imports",
  {
    id: serial("id").primaryKey(),
    catalogEntryId: integer("catalog_entry_id").notNull(),
    entryType: varchar("entry_type", { length: 20 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description").default(""),
    category: varchar("category", { length: 50 }).default(""),
    tags: json("tags").$type<string[]>().default([]),
    config: json("config").$type<Record<string, any>>().default({}),
    status: varchar("status", { length: 20 }).default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    catalogEntryIdx: index("idx_code_catalog_imports_entry").on(table.catalogEntryId),
  })
);
