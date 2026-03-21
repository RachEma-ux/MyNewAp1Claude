CREATE TYPE "public"."candidate_status" AS ENUM('OPEN', 'IN_REVIEW', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."discovery_attempt_status" AS ENUM('ok', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."discovery_failure_reason" AS ENUM('INVALID_URL', 'SSRF_BLOCKED', 'DNS_FAILED', 'FETCH_TIMEOUT', 'FETCH_TOO_LARGE', 'FETCH_HTTP_ERROR', 'PARSE_FAILED', 'NO_METADATA_FOUND', 'NO_CANDIDATES', 'PROBE_ALL_FAILED');--> statement-breakpoint
CREATE TYPE "public"."patch_artifact_status" AS ENUM('PROPOSED', 'MERGED', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."reject_category" AS ENUM('NOT_A_PROVIDER', 'TOO_NICHE', 'DUPLICATE_OF_EXISTING', 'TEMPORARY_OUTAGE', 'NEEDS_MANUAL_CONNECT_ONLY', 'SECURITY_POLICY_BLOCK', 'OTHER');--> statement-breakpoint
CREATE TABLE "governance_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(100) NOT NULL,
	"agentId" integer,
	"workspaceId" varchar(255),
	"actorId" varchar(255),
	"decision" varchar(20),
	"reason" text,
	"details" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"connectionId" integer NOT NULL,
	"action" varchar(50) NOT NULL,
	"actor" integer NOT NULL,
	"metadata" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"providerId" integer NOT NULL,
	"workspaceId" integer NOT NULL,
	"baseUrl" text NOT NULL,
	"lifecycleStatus" varchar(30) DEFAULT 'draft' NOT NULL,
	"healthStatus" varchar(30),
	"lastHealthCheck" timestamp,
	"secretVersion" integer DEFAULT 1 NOT NULL,
	"capabilities" json,
	"modelCount" integer,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_discovery_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"actorId" integer,
	"domain" text NOT NULL,
	"normalizedUrl" text,
	"status" varchar(20) NOT NULL,
	"failureReason" varchar(50),
	"bestUrl" text,
	"candidateCount" integer DEFAULT 0,
	"probeSummary" json,
	"warnings" json,
	"debug" json
);
--> statement-breakpoint
CREATE TABLE "provider_secrets" (
	"id" serial PRIMARY KEY NOT NULL,
	"connectionId" integer NOT NULL,
	"encryptedPat" text NOT NULL,
	"keyVersion" integer DEFAULT 1 NOT NULL,
	"rotatedFrom" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registry_patch_artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"createdBy" integer NOT NULL,
	"sourceDomain" text NOT NULL,
	"status" varchar(20) DEFAULT 'PROPOSED' NOT NULL,
	"draftRegistryEntry" json NOT NULL,
	"notes" text,
	"linkedPrUrl" text
);
--> statement-breakpoint
CREATE TABLE "registry_promotion_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"status" varchar(20) DEFAULT 'OPEN' NOT NULL,
	"firstDetectedAt" timestamp DEFAULT now() NOT NULL,
	"lastDetectedAt" timestamp DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp DEFAULT now() NOT NULL,
	"triggerType" varchar(50),
	"attemptsTotal" integer DEFAULT 0 NOT NULL,
	"attemptsFailed" integer DEFAULT 0 NOT NULL,
	"bestUrlNullRate" numeric(5, 4) DEFAULT '0',
	"reviewedBy" integer,
	"reviewedAt" timestamp,
	"rejectedBy" integer,
	"rejectedAt" timestamp,
	"rejectCategory" varchar(50),
	"rejectNotes" text,
	"rejectSnapshot" json,
	"acceptedBy" integer,
	"acceptedAt" timestamp,
	"patchId" integer,
	"draftRegistryEntry" json,
	"attemptsSinceReject" integer DEFAULT 0 NOT NULL,
	"autoReopenedAt" timestamp,
	"autoReopenReason" varchar(30),
	"autoReopenEvidence" json,
	CONSTRAINT "registry_promotion_candidates_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "import_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"sessionId" text,
	"userId" integer,
	"method" varchar(50),
	"sourceRef" text,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"previewCount" integer DEFAULT 0,
	"selectedCount" integer DEFAULT 0,
	"createdCount" integer DEFAULT 0,
	"skippedCount" integer DEFAULT 0,
	"conflictOverrides" integer DEFAULT 0,
	"highRiskCount" integer DEFAULT 0,
	"ipAddress" varchar(45),
	"userAgent" text
);
--> statement-breakpoint
CREATE TABLE "import_preview_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"sessionId" text NOT NULL,
	"tempId" text NOT NULL,
	"type" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"source" varchar(100) NOT NULL,
	"metadata" json,
	"duplicateStatus" varchar(50) DEFAULT 'new' NOT NULL,
	"riskLevel" varchar(20) DEFAULT 'low' NOT NULL,
	"validationIssues" json
);
--> statement-breakpoint
CREATE TABLE "import_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"method" varchar(50) NOT NULL,
	"sourceRef" text NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"summary" json,
	"error" text,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "governance_scorecards" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_id" integer,
	"subject_name" varchar(255),
	"subject_type" varchar(50),
	"stage" varchar(50) NOT NULL,
	"commit_ref" varchar(64),
	"score" integer NOT NULL,
	"max_weight" integer NOT NULL,
	"achieved_weight" integer NOT NULL,
	"gate_verdict" varchar(10) NOT NULL,
	"gate_reason" text,
	"risk_critical" integer DEFAULT 0 NOT NULL,
	"risk_high" integer DEFAULT 0 NOT NULL,
	"risk_medium" integer DEFAULT 0 NOT NULL,
	"risk_low" integer DEFAULT 0 NOT NULL,
	"controls_total" integer NOT NULL,
	"controls_passed" integer NOT NULL,
	"controls_failed" integer NOT NULL,
	"controls_skipped" integer NOT NULL,
	"control_results" json,
	"loaded_packs" json,
	"missing_packs" json,
	"evidence_bundle_id" varchar(100),
	"evidence_hash" varchar(64),
	"evidence_artifact_path" varchar(500),
	"triggered_by" varchar(255),
	"actor_role" varchar(50),
	"blocked" boolean DEFAULT false NOT NULL,
	"http_status" integer DEFAULT 200,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drift_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"drift_detected" boolean NOT NULL,
	"score_delta" integer NOT NULL,
	"previous_score" integer NOT NULL,
	"current_score" integer NOT NULL,
	"new_violations" json NOT NULL,
	"resolved_violations" json NOT NULL,
	"gate_passed" boolean NOT NULL,
	"escalation_needed" boolean NOT NULL,
	"escalation_reason" text,
	"frozen_subject_ids" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_bundles" (
	"id" serial PRIMARY KEY NOT NULL,
	"bundle_id" varchar(100) NOT NULL,
	"version" varchar(10) NOT NULL,
	"stage" varchar(50) NOT NULL,
	"score" integer NOT NULL,
	"gate_passed" boolean NOT NULL,
	"gate_reason" text,
	"triggered_by" varchar(255),
	"commit_ref" varchar(64),
	"integrity_hash" varchar(64) NOT NULL,
	"bundle_data" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject_freezes" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_id" integer NOT NULL,
	"subject_name" varchar(255) NOT NULL,
	"reason" text NOT NULL,
	"score_at_freeze" integer NOT NULL,
	"frozen_by" varchar(255) NOT NULL,
	"frozen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capabilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"description" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "capabilities_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "workspace_principal_capabilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"userId" integer NOT NULL,
	"capabilityId" integer NOT NULL,
	"effect" varchar(10) NOT NULL,
	"constraints" json,
	CONSTRAINT "workspace_principal_capabilities_workspaceId_userId_capabilityId_unique" UNIQUE("workspaceId","userId","capabilityId")
);
--> statement-breakpoint
CREATE TABLE "workspace_role_capabilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"roleId" integer NOT NULL,
	"capabilityId" integer NOT NULL,
	"scope" varchar(50) DEFAULT 'workspace' NOT NULL,
	"constraints" json,
	CONSTRAINT "workspace_role_capabilities_roleId_capabilityId_unique" UNIQUE("roleId","capabilityId")
);
--> statement-breakpoint
CREATE TABLE "workspace_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"isSystem" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_roles_workspaceId_name_unique" UNIQUE("workspaceId","name")
);
--> statement-breakpoint
CREATE TABLE "workspace_activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"moduleKey" varchar(50),
	"actorId" integer,
	"action" varchar(100) NOT NULL,
	"targetType" varchar(50),
	"targetId" integer,
	"metadata" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_modules" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"moduleKey" varchar(50) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"mode" varchar(50) DEFAULT 'standard' NOT NULL,
	"config" json,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_modules_workspaceId_moduleKey_unique" UNIQUE("workspaceId","moduleKey")
);
--> statement-breakpoint
CREATE TABLE "governance_audit_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"principal_id" varchar(255) NOT NULL,
	"default_format" varchar(10) NOT NULL,
	"default_design" varchar(20) NOT NULL,
	"default_strict" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "governance_audit_preferences_principal_id_unique" UNIQUE("principal_id")
);
--> statement-breakpoint
CREATE TABLE "governance_audit_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" varchar(20) NOT NULL,
	"format" varchar(10) NOT NULL,
	"strict" boolean DEFAULT false NOT NULL,
	"design" varchar(20) NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"duration_ms" integer,
	"triggered_by" varchar(255),
	"error_message" text,
	"summary_json" json,
	"violations_json" json,
	"coverage_json" json,
	"json_ref" varchar(128),
	"txt_ref" varchar(128),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" varchar(64) NOT NULL,
	"operator" varchar(32) NOT NULL,
	"results_json" json NOT NULL,
	"total_duration_ms" integer NOT NULL,
	"total_syscalls" integer NOT NULL,
	"succeeded" integer NOT NULL,
	"failed" integer NOT NULL,
	"denied" integer NOT NULL,
	"skipped" integer NOT NULL,
	"completed_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"trace_id" varchar(64) NOT NULL,
	"job_id" varchar(64) NOT NULL,
	"operator" varchar(32) NOT NULL,
	"requested_by" varchar(255) NOT NULL,
	"syscall_index" integer NOT NULL,
	"action" varchar(64) NOT NULL,
	"args_hash" varchar(64) NOT NULL,
	"verdict" varchar(16) NOT NULL,
	"reason" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"result_summary" varchar(128) NOT NULL,
	"executed_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" varchar(64) NOT NULL,
	"operator" varchar(32) NOT NULL,
	"intent_description" text NOT NULL,
	"intent_json" json NOT NULL,
	"constraints_json" json NOT NULL,
	"status" varchar(32) NOT NULL,
	"trace_id" varchar(64) NOT NULL,
	"requested_by" varchar(255) NOT NULL,
	"workspace_id" integer,
	"result_json" json,
	"execution_result_json" json,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "operator_jobs_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "syscall_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" varchar(64) NOT NULL,
	"operator" varchar(32) NOT NULL,
	"plan_json" json NOT NULL,
	"explain" text NOT NULL,
	"risk_level" varchar(16) NOT NULL,
	"risk_reasoning" text,
	"model_used" varchar(128),
	"provider_used" varchar(64),
	"syscall_count" integer NOT NULL,
	"generated_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_runs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "workflow_runs" CASCADE;--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD COLUMN "stageReviews" json;--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD COLUMN "frozen" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD COLUMN "freeze_reason" text;--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD COLUMN "frozen_at" timestamp;--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD COLUMN "frozen_by" varchar(255);--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "roleId" integer;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "type" varchar(50) DEFAULT 'generic';--> statement-breakpoint
ALTER TABLE "provider_audit_log" ADD CONSTRAINT "provider_audit_log_connectionId_provider_connections_id_fk" FOREIGN KEY ("connectionId") REFERENCES "public"."provider_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_secrets" ADD CONSTRAINT "provider_secrets_connectionId_provider_connections_id_fk" FOREIGN KEY ("connectionId") REFERENCES "public"."provider_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_principal_capabilities" ADD CONSTRAINT "workspace_principal_capabilities_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_principal_capabilities" ADD CONSTRAINT "workspace_principal_capabilities_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_principal_capabilities" ADD CONSTRAINT "workspace_principal_capabilities_capabilityId_capabilities_id_fk" FOREIGN KEY ("capabilityId") REFERENCES "public"."capabilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_role_capabilities" ADD CONSTRAINT "workspace_role_capabilities_roleId_workspace_roles_id_fk" FOREIGN KEY ("roleId") REFERENCES "public"."workspace_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_role_capabilities" ADD CONSTRAINT "workspace_role_capabilities_capabilityId_capabilities_id_fk" FOREIGN KEY ("capabilityId") REFERENCES "public"."capabilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_roles" ADD CONSTRAINT "workspace_roles_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_activity_log" ADD CONSTRAINT "workspace_activity_log_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_modules" ADD CONSTRAINT "workspace_modules_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_gov_audit_code" ON "governance_audit_logs" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_gov_audit_agent" ON "governance_audit_logs" USING btree ("agentId");--> statement-breakpoint
CREATE INDEX "idx_gov_audit_created" ON "governance_audit_logs" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "idx_paudit_connection" ON "provider_audit_log" USING btree ("connectionId");--> statement-breakpoint
CREATE INDEX "idx_paudit_action" ON "provider_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_paudit_timestamp" ON "provider_audit_log" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "idx_pconn_workspace" ON "provider_connections" USING btree ("workspaceId");--> statement-breakpoint
CREATE INDEX "idx_pconn_provider" ON "provider_connections" USING btree ("providerId");--> statement-breakpoint
CREATE INDEX "idx_pconn_status" ON "provider_connections" USING btree ("lifecycleStatus");--> statement-breakpoint
CREATE INDEX "idx_pde_domain" ON "provider_discovery_events" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "idx_pde_created_at" ON "provider_discovery_events" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "idx_pde_domain_created_at" ON "provider_discovery_events" USING btree ("domain","createdAt");--> statement-breakpoint
CREATE INDEX "idx_pde_status" ON "provider_discovery_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_psecret_connection" ON "provider_secrets" USING btree ("connectionId");--> statement-breakpoint
CREATE INDEX "idx_rpa_source_domain" ON "registry_patch_artifacts" USING btree ("sourceDomain");--> statement-breakpoint
CREATE INDEX "idx_rpa_status" ON "registry_patch_artifacts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rpa_created_at" ON "registry_patch_artifacts" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "idx_rpc_status" ON "registry_promotion_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rpc_last_seen" ON "registry_promotion_candidates" USING btree ("lastSeenAt");--> statement-breakpoint
CREATE INDEX "idx_rpc_domain" ON "registry_promotion_candidates" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "idx_rpc_status_last_seen" ON "registry_promotion_candidates" USING btree ("status","lastSeenAt");--> statement-breakpoint
CREATE INDEX "idx_import_audit_session" ON "import_audit_logs" USING btree ("sessionId");--> statement-breakpoint
CREATE INDEX "idx_import_audit_timestamp" ON "import_audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_import_preview_session" ON "import_preview_rows" USING btree ("sessionId");--> statement-breakpoint
CREATE INDEX "idx_import_session_status" ON "import_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_import_session_expires" ON "import_sessions" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "idx_gov_scorecard_subject" ON "governance_scorecards" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "idx_gov_scorecard_stage" ON "governance_scorecards" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "idx_gov_scorecard_verdict" ON "governance_scorecards" USING btree ("gate_verdict");--> statement-breakpoint
CREATE INDEX "idx_gov_scorecard_created" ON "governance_scorecards" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_gov_scorecard_subject_stage" ON "governance_scorecards" USING btree ("subject_id","stage");--> statement-breakpoint
CREATE INDEX "idx_gov_scorecard_evidence" ON "governance_scorecards" USING btree ("evidence_bundle_id");--> statement-breakpoint
CREATE INDEX "idx_drift_events_created" ON "drift_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_drift_events_drift" ON "drift_events" USING btree ("drift_detected");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_evidence_bundles_bundle_id" ON "evidence_bundles" USING btree ("bundle_id");--> statement-breakpoint
CREATE INDEX "idx_evidence_bundles_stage" ON "evidence_bundles" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "idx_evidence_bundles_created" ON "evidence_bundles" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_evidence_bundles_hash" ON "evidence_bundles" USING btree ("integrity_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_subject_freezes_subject" ON "subject_freezes" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "idx_audit_run_started" ON "governance_audit_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_audit_run_status" ON "governance_audit_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_audit_run_triggered" ON "governance_audit_runs" USING btree ("triggered_by");--> statement-breakpoint
CREATE INDEX "idx_exec_results_job_id" ON "execution_results" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_exec_results_operator" ON "execution_results" USING btree ("operator");--> statement-breakpoint
CREATE INDEX "idx_audit_trace_id" ON "operator_audit_log" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "idx_audit_job_id" ON "operator_audit_log" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_audit_operator" ON "operator_audit_log" USING btree ("operator");--> statement-breakpoint
CREATE INDEX "idx_audit_action" ON "operator_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_audit_verdict" ON "operator_audit_log" USING btree ("verdict");--> statement-breakpoint
CREATE INDEX "idx_audit_executed" ON "operator_audit_log" USING btree ("executed_at");--> statement-breakpoint
CREATE INDEX "idx_operator_jobs_job_id" ON "operator_jobs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_operator_jobs_operator" ON "operator_jobs" USING btree ("operator");--> statement-breakpoint
CREATE INDEX "idx_operator_jobs_status" ON "operator_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_operator_jobs_created" ON "operator_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_batches_job_id" ON "syscall_batches" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_batches_operator" ON "syscall_batches" USING btree ("operator");--> statement-breakpoint
ALTER TABLE "agent_history" ADD CONSTRAINT "agent_history_agentId_agents_id_fk" FOREIGN KEY ("agentId") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agentVersions" ADD CONSTRAINT "agentVersions_agentId_agents_id_fk" FOREIGN KEY ("agentId") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agentVersions" ADD CONSTRAINT "agentVersions_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agentId_agents_id_fk" FOREIGN KEY ("agentId") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_modelId_models_id_fk" FOREIGN KEY ("modelId") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_documentId_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedBy_users_id_fk" FOREIGN KEY ("uploadedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_configs" ADD CONSTRAINT "model_configs_modelId_models_id_fk" FOREIGN KEY ("modelId") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_configs" ADD CONSTRAINT "model_configs_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotionRequests" ADD CONSTRAINT "promotionRequests_agentId_agents_id_fk" FOREIGN KEY ("agentId") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotionRequests" ADD CONSTRAINT "promotionRequests_requestedBy_users_id_fk" FOREIGN KEY ("requestedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_health_checks" ADD CONSTRAINT "provider_health_checks_providerId_providers_id_fk" FOREIGN KEY ("providerId") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_metrics" ADD CONSTRAINT "provider_metrics_providerId_providers_id_fk" FOREIGN KEY ("providerId") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_usage" ADD CONSTRAINT "provider_usage_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_usage" ADD CONSTRAINT "provider_usage_providerId_providers_id_fk" FOREIGN KEY ("providerId") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_audit_logs" ADD CONSTRAINT "routing_audit_logs_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_audit_logs" ADD CONSTRAINT "routing_audit_logs_primaryProviderId_providers_id_fk" FOREIGN KEY ("primaryProviderId") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_audit_logs" ADD CONSTRAINT "routing_audit_logs_actualProviderId_providers_id_fk" FOREIGN KEY ("actualProviderId") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD CONSTRAINT "workflow_execution_logs_executionId_workflow_executions_id_fk" FOREIGN KEY ("executionId") REFERENCES "public"."workflow_executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflowId_workflows_id_fk" FOREIGN KEY ("workflowId") REFERENCES "public"."workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_versionId_workflow_versions_id_fk" FOREIGN KEY ("versionId") REFERENCES "public"."workflow_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflowId_workflows_id_fk" FOREIGN KEY ("workflowId") REFERENCES "public"."workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_publishedBy_users_id_fk" FOREIGN KEY ("publishedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_providers" ADD CONSTRAINT "workspace_providers_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_providers" ADD CONSTRAINT "workspace_providers_providerId_providers_id_fk" FOREIGN KEY ("providerId") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_ownerId_users_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;