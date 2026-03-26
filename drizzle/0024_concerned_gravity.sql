CREATE TABLE IF NOT EXISTS "workspace_crew" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"agentId" integer NOT NULL,
	"agentName" varchar(255) NOT NULL,
	"participantType" varchar(50) DEFAULT 'agent' NOT NULL,
	"role" varchar(50) DEFAULT 'executor' NOT NULL,
	"note" text,
	"capabilities" json,
	"constraints" json,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"providerId" integer NOT NULL,
	"version" integer NOT NULL,
	"createdBy" integer NOT NULL,
	"changeNotes" text,
	"providerSnapshot" json NOT NULL,
	"policyHash" varchar(64),
	"policyDecision" varchar(50) DEFAULT 'pending',
	"lifecycleStatusAtVersion" varchar(30),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "execution_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"catalogEntryId" integer NOT NULL,
	"sourceAgentId" integer,
	"conversationId" integer,
	"actorUserId" integer,
	"triggerSource" varchar(50) NOT NULL,
	"state" varchar(20) DEFAULT 'created' NOT NULL,
	"provider" varchar(255),
	"modelId" varchar(255),
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"firstTokenAt" timestamp,
	"completedAt" timestamp,
	"success" boolean,
	"blockerCode" varchar(100),
	"blockerCategory" varchar(100),
	"blockerSummary" text,
	"finishReason" varchar(50),
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bot_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"botId" integer NOT NULL,
	"version" integer NOT NULL,
	"createdBy" integer NOT NULL,
	"changeNotes" text,
	"botSnapshot" json NOT NULL,
	"policyHash" varchar(64),
	"policyDecision" varchar(50) DEFAULT 'pending',
	"promotionRequestId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bots" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"displayName" varchar(255),
	"description" text,
	"agentId" integer,
	"llmId" integer,
	"channels" json,
	"behaviorConfig" json,
	"rateLimit" integer,
	"scope" varchar(50) DEFAULT 'app' NOT NULL,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"workspace_id" integer,
	"target_worker_id" integer,
	"action" varchar(100) NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_employment_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"employment_status" varchar(30) DEFAULT 'active' NOT NULL,
	"contract_type" varchar(50) DEFAULT 'permanent',
	"start_date" date NOT NULL,
	"end_date" date,
	"probation_end_date" date,
	"legal_entity" varchar(200),
	"work_location" varchar(200),
	"cost_center" varchar(100),
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_people" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(100) DEFAULT 'default' NOT NULL,
	"external_ref" varchar(255),
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"preferred_name" varchar(100),
	"primary_email" varchar(255) NOT NULL,
	"primary_phone" varchar(50),
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hr_people_email_uniq" UNIQUE("tenant_id","primary_email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_role_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"worker_id" integer,
	"hr_role" varchar(30) NOT NULL,
	"scope" varchar(30) DEFAULT 'global',
	"scope_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"assigned_by" integer,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hr_role_active_user_uniq" UNIQUE("user_id","hr_role","scope","scope_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_worker_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"person_id" integer NOT NULL,
	"employee_number" varchar(50),
	"worker_type" varchar(30) DEFAULT 'employee' NOT NULL,
	"manager_worker_id" integer,
	"home_org_unit_id" integer,
	"primary_position_id" integer,
	"employment_category" varchar(50) DEFAULT 'full_time',
	"home_workspace_visibility" varchar(30) DEFAULT 'public_internal',
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hr_worker_emp_number_uniq" UNIQUE("employee_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_job_families" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(100) DEFAULT 'default' NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_job_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(100) DEFAULT 'default' NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_org_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(100) DEFAULT 'default' NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" varchar(50) DEFAULT 'department' NOT NULL,
	"parent_org_unit_id" integer,
	"manager_worker_id" integer,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hr_org_code_uniq" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(100) DEFAULT 'default' NOT NULL,
	"position_code" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"job_family_id" integer,
	"job_level_id" integer,
	"org_unit_id" integer,
	"reports_to_position_id" integer,
	"budgeted" boolean DEFAULT true NOT NULL,
	"filled" boolean DEFAULT false NOT NULL,
	"headcount_limit" integer DEFAULT 1 NOT NULL,
	"status" varchar(30) DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hr_position_code_uniq" UNIQUE("tenant_id","position_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"document_type" varchar(50) NOT NULL,
	"title" varchar(300) NOT NULL,
	"storage_key" varchar(500),
	"mime_type" varchar(100),
	"uploaded_by" integer,
	"visibility_class" varchar(30) DEFAULT 'hr_restricted',
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_worker_certifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"certification_name" varchar(200) NOT NULL,
	"issuing_body" varchar(200),
	"issue_date" date,
	"expiry_date" date,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_worker_skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"skill_name" varchar(200) NOT NULL,
	"proficiency_level" varchar(30) DEFAULT 'intermediate',
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_workspace_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"worker_id" integer NOT NULL,
	"role_code" varchar(50) DEFAULT 'member' NOT NULL,
	"allocation_pct" integer DEFAULT 100 NOT NULL,
	"assignment_type" varchar(30) DEFAULT 'primary' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"is_primary" boolean DEFAULT false NOT NULL,
	"approval_status" varchar(30) DEFAULT 'approved' NOT NULL,
	"visibility_level" varchar(30) DEFAULT 'public_internal',
	"notes" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"recruitment_request_id" integer NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(50),
	"resume_storage_key" varchar(500),
	"source" varchar(100),
	"pipeline_stage" varchar(30) DEFAULT 'applied' NOT NULL,
	"rating" integer,
	"notes" text,
	"rejection_reason" varchar(200),
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_interviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"recruitment_request_id" integer NOT NULL,
	"interviewer_id" integer,
	"type" varchar(30) DEFAULT 'standard' NOT NULL,
	"scheduled_at" timestamp,
	"duration_minutes" integer DEFAULT 60,
	"location" varchar(300),
	"status" varchar(30) DEFAULT 'scheduled' NOT NULL,
	"outcome" varchar(30),
	"feedback" text,
	"rating" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_offers" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"recruitment_request_id" integer NOT NULL,
	"position_id" integer,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"offer_date" date,
	"expiry_date" date,
	"proposed_start_date" date,
	"employment_type" varchar(30),
	"notes" text,
	"accepted_at" timestamp,
	"declined_at" timestamp,
	"decline_reason" varchar(300),
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_recruitment_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(100) DEFAULT 'default' NOT NULL,
	"title" varchar(300) NOT NULL,
	"position_id" integer,
	"org_unit_id" integer,
	"hiring_manager_id" integer,
	"priority" varchar(20) DEFAULT 'normal' NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"headcount" integer DEFAULT 1 NOT NULL,
	"job_description" text,
	"required_skills" json,
	"employment_type" varchar(30) DEFAULT 'full_time',
	"target_start_date" date,
	"closed_at" timestamp,
	"closed_reason" varchar(100),
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_exit_interviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"offboarding_case_id" integer NOT NULL,
	"worker_id" integer NOT NULL,
	"interviewer_id" integer,
	"scheduled_at" timestamp,
	"conducted_at" timestamp,
	"status" varchar(30) DEFAULT 'scheduled' NOT NULL,
	"feedback" text,
	"overall_satisfaction" integer,
	"would_recommend" boolean,
	"primary_reason" varchar(200),
	"confidential" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_knowledge_transfer_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"offboarding_case_id" integer NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text,
	"recipient_worker_id" integer,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_lifecycle_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer NOT NULL,
	"event" varchar(100) NOT NULL,
	"from_status" varchar(50),
	"to_status" varchar(50),
	"actor_id" integer,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_offboarding_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"reason" varchar(50) NOT NULL,
	"status" varchar(30) DEFAULT 'initiated' NOT NULL,
	"last_working_date" date,
	"notice_date" date,
	"completed_at" timestamp,
	"total_tasks" integer DEFAULT 0 NOT NULL,
	"completed_tasks" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_offboarding_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" integer NOT NULL,
	"category" varchar(50) NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text,
	"assignee_id" integer,
	"assignee_role" varchar(50),
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"priority" varchar(20) DEFAULT 'normal',
	"due_date" date,
	"completed_at" timestamp,
	"completed_by" integer,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_onboarding_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer,
	"candidate_id" integer,
	"offer_id" integer,
	"position_id" integer,
	"org_unit_id" integer,
	"manager_worker_id" integer,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"planned_start_date" date,
	"actual_start_date" date,
	"completed_at" timestamp,
	"total_tasks" integer DEFAULT 0 NOT NULL,
	"completed_tasks" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_onboarding_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" integer NOT NULL,
	"category" varchar(50) NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text,
	"assignee_id" integer,
	"assignee_role" varchar(50),
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"priority" varchar(20) DEFAULT 'normal',
	"due_date" date,
	"completed_at" timestamp,
	"completed_by" integer,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_leave_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"leave_type_id" integer NOT NULL,
	"year" integer NOT NULL,
	"entitlement" numeric(5, 1) DEFAULT '0' NOT NULL,
	"used" numeric(5, 1) DEFAULT '0' NOT NULL,
	"pending" numeric(5, 1) DEFAULT '0' NOT NULL,
	"carried_over" numeric(5, 1) DEFAULT '0',
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_leave_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"leave_type_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"total_days" numeric(5, 1) NOT NULL,
	"reason" text,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"rejection_reason" text,
	"notes" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_leave_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"default_days_per_year" integer,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"is_paid" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_overtime_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"request_date" date NOT NULL,
	"start_time" varchar(10) NOT NULL,
	"end_time" varchar(10) NOT NULL,
	"hours" numeric(5, 2) NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"rejection_reason" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_shift_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"shift_plan_id" integer NOT NULL,
	"worker_id" integer NOT NULL,
	"assigned_date" date NOT NULL,
	"status" varchar(30) DEFAULT 'assigned' NOT NULL,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_shift_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"org_unit_id" integer,
	"start_date" date NOT NULL,
	"end_date" date,
	"shift_start_time" varchar(10) NOT NULL,
	"shift_end_time" varchar(10) NOT NULL,
	"break_minutes" integer DEFAULT 0,
	"max_capacity" integer,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_time_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"entry_date" date NOT NULL,
	"start_time" varchar(10),
	"end_time" varchar(10),
	"hours_worked" numeric(5, 2),
	"break_minutes" integer DEFAULT 0,
	"entry_type" varchar(30) DEFAULT 'regular' NOT NULL,
	"description" text,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"rejection_reason" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_certifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50),
	"name" varchar(200) NOT NULL,
	"description" text,
	"issuing_body" varchar(200),
	"validity_months" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_employee_certifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"certification_id" integer NOT NULL,
	"obtained_date" date,
	"expiry_date" date,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"certificate_ref" varchar(500),
	"renewal_date" date,
	"notes" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_learning_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"training_id" integer NOT NULL,
	"assigned_by" integer,
	"due_date" date,
	"status" varchar(30) DEFAULT 'assigned' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"score" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_learning_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"training_id" integer,
	"training_title" varchar(300) NOT NULL,
	"completed_at" timestamp NOT NULL,
	"score" integer,
	"certificate_ref" varchar(500),
	"valid_until" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_mandatory_training_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"training_id" integer NOT NULL,
	"target_type" varchar(30) NOT NULL,
	"target_value" varchar(100),
	"due_days" integer DEFAULT 30 NOT NULL,
	"recurring_months" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_training_catalog" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50),
	"title" varchar(300) NOT NULL,
	"description" text,
	"category" varchar(100),
	"provider" varchar(200),
	"duration_hours" integer,
	"format" varchar(50) DEFAULT 'online',
	"is_mandatory" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"prerequisites" json,
	"tags" json,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"cycle_id" integer NOT NULL,
	"worker_id" integer NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text,
	"category" varchar(50),
	"weight" integer DEFAULT 0,
	"target_metric" varchar(200),
	"current_progress" integer DEFAULT 0,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"manager_approved" boolean DEFAULT false,
	"due_date" date,
	"completed_at" timestamp,
	"employee_notes" text,
	"manager_notes" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_performance_cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"cycle_type" varchar(30) DEFAULT 'annual' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"goal_setting_deadline" date,
	"self_review_deadline" date,
	"manager_review_deadline" date,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_performance_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"cycle_id" integer NOT NULL,
	"worker_id" integer NOT NULL,
	"reviewer_id" integer,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"self_rating" integer,
	"self_comments" text,
	"self_submitted_at" timestamp,
	"manager_rating" integer,
	"manager_comments" text,
	"manager_submitted_at" timestamp,
	"overall_rating" integer,
	"overall_comments" text,
	"development_plan" text,
	"completed_at" timestamp,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_benefit_enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"benefit_plan_id" integer NOT NULL,
	"enrollment_date" date NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"coverage_level" varchar(50),
	"notes" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_benefit_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50),
	"name" varchar(200) NOT NULL,
	"description" text,
	"category" varchar(50) NOT NULL,
	"provider" varchar(200),
	"employer_contribution" numeric(12, 2),
	"employee_contribution" numeric(12, 2),
	"enrollment_window_start" date,
	"enrollment_window_end" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_bonus_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"bonus_type" varchar(50) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"period" varchar(30),
	"reason" text,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"paid_at" timestamp,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_compensation_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"salary_band_id" integer,
	"base_salary" numeric(12, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"pay_frequency" varchar(30) DEFAULT 'monthly' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"change_reason" varchar(100),
	"notes" text,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_salary_bands" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50),
	"name" varchar(200) NOT NULL,
	"description" text,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"min_amount" numeric(12, 2) NOT NULL,
	"mid_amount" numeric(12, 2),
	"max_amount" numeric(12, 2) NOT NULL,
	"job_level" varchar(50),
	"job_family" varchar(100),
	"effective_from" date,
	"effective_to" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_salary_review_cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"budget_percent" numeric(5, 2),
	"effective_date" date,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_disciplinary_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"reason" text NOT NULL,
	"description" text,
	"issued_by_worker_id" integer,
	"issued_at" date,
	"expires_at" date,
	"related_grievance_id" integer,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"appeal_notes" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_grievances" (
	"id" serial PRIMARY KEY NOT NULL,
	"filed_by_worker_id" integer NOT NULL,
	"against_worker_id" integer,
	"category" varchar(100) NOT NULL,
	"subject" varchar(300) NOT NULL,
	"description" text NOT NULL,
	"severity" varchar(30) DEFAULT 'medium' NOT NULL,
	"is_confidential" boolean DEFAULT true NOT NULL,
	"assigned_to_id" integer,
	"status" varchar(30) DEFAULT 'filed' NOT NULL,
	"resolution_notes" text,
	"resolved_at" timestamp,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_investigations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text,
	"category" varchar(100),
	"related_grievance_id" integer,
	"investigator_id" integer,
	"subject_worker_id" integer,
	"is_confidential" boolean DEFAULT true NOT NULL,
	"started_at" date,
	"completed_at" date,
	"findings" text,
	"recommendation" text,
	"status" varchar(30) DEFAULT 'opened' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50),
	"title" varchar(300) NOT NULL,
	"description" text,
	"category" varchar(100),
	"content" text,
	"version" integer DEFAULT 1 NOT NULL,
	"effective_from" date,
	"requires_acknowledgement" boolean DEFAULT false NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"published_at" timestamp,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_policy_acknowledgements" (
	"id" serial PRIMARY KEY NOT NULL,
	"policy_id" integer NOT NULL,
	"worker_id" integer NOT NULL,
	"acknowledged_at" timestamp,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_engagement_programs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"category" varchar(100),
	"start_date" date,
	"end_date" date,
	"status" varchar(30) DEFAULT 'planned' NOT NULL,
	"participant_count" integer DEFAULT 0,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_recognition_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer,
	"recipient_worker_id" integer NOT NULL,
	"nominated_by_worker_id" integer,
	"title" varchar(300) NOT NULL,
	"description" text,
	"award_date" date,
	"value" varchar(100),
	"status" varchar(30) DEFAULT 'nominated' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_recognition_programs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"category" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_survey_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text,
	"survey_type" varchar(50) DEFAULT 'pulse' NOT NULL,
	"questions" json,
	"start_date" date,
	"end_date" date,
	"is_anonymous" boolean DEFAULT true NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"total_invited" integer DEFAULT 0,
	"total_responses" integer DEFAULT 0,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_survey_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"worker_id" integer,
	"answers" json,
	"overall_rating" integer,
	"comments" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_wellbeing_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text,
	"category" varchar(100),
	"resource_type" varchar(50),
	"url" text,
	"contact_info" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_compliance_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"obligation_id" integer,
	"title" varchar(300) NOT NULL,
	"description" text,
	"evidence_type" varchar(50),
	"document_ref" varchar(500),
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"recorded_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_compliance_obligations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text,
	"category" varchar(100),
	"regulation" varchar(200),
	"due_date" date,
	"recurring_months" integer,
	"owner_id" integer,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"last_reviewed_at" timestamp,
	"next_review_date" date,
	"notes" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_incident_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(100) NOT NULL,
	"severity" varchar(30) DEFAULT 'medium' NOT NULL,
	"incident_date" date NOT NULL,
	"location" varchar(300),
	"reported_by_worker_id" integer,
	"affected_worker_id" integer,
	"assigned_to_id" integer,
	"root_cause" text,
	"corrective_action" text,
	"status" varchar(30) DEFAULT 'reported' NOT NULL,
	"resolved_at" timestamp,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_risk_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text,
	"category" varchar(100),
	"likelihood" varchar(30) DEFAULT 'medium' NOT NULL,
	"impact" varchar(30) DEFAULT 'medium' NOT NULL,
	"risk_score" integer,
	"owner_id" integer,
	"mitigation_plan" text,
	"mitigation_due_date" date,
	"status" varchar(30) DEFAULT 'identified' NOT NULL,
	"review_date" date,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_metric_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"metric_name" varchar(100) NOT NULL,
	"metric_category" varchar(100) NOT NULL,
	"value" varchar(100) NOT NULL,
	"unit" varchar(50),
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"dimensions" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_report_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"category" varchar(100),
	"report_type" varchar(50) DEFAULT 'standard' NOT NULL,
	"config" json,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_succession_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"succession_plan_id" integer NOT NULL,
	"candidate_worker_id" integer NOT NULL,
	"readiness" varchar(30) DEFAULT 'ready_2yr' NOT NULL,
	"development_needs" text,
	"priority" integer DEFAULT 0,
	"status" varchar(30) DEFAULT 'nominated' NOT NULL,
	"notes" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_succession_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"position_id" integer,
	"position_title" varchar(300) NOT NULL,
	"criticality" varchar(30) DEFAULT 'medium' NOT NULL,
	"current_incumbent_id" integer,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"notes" text,
	"last_reviewed_at" timestamp,
	"next_review_date" date,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hr_talent_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"reviewer_id" integer,
	"review_date" date NOT NULL,
	"performance_rating" varchar(30),
	"potential_rating" varchar(30),
	"nine_box_position" varchar(30),
	"readiness_for_promotion" varchar(30),
	"retention_risk" varchar(30),
	"strengths" text,
	"development_areas" text,
	"notes" text,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "status" varchar(50) DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "purposeType" varchar(50) DEFAULT 'other';--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "purposeRef" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "resourceProfile" json;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "shellConfig" json;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "lifecycleStatus" varchar(30) DEFAULT 'configured';--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD COLUMN IF NOT EXISTS "sourceType" varchar(50);--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD COLUMN IF NOT EXISTS "sourceId" integer;--> statement-breakpoint
ALTER TABLE "workspace_activity_log" ADD COLUMN IF NOT EXISTS "actorType" varchar(20) DEFAULT 'user';--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "workspace_crew" ADD CONSTRAINT "workspace_crew_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "provider_versions" ADD CONSTRAINT "provider_versions_providerId_providers_id_fk" FOREIGN KEY ("providerId") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_employment_records" ADD CONSTRAINT "hr_employment_records_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_worker_profiles" ADD CONSTRAINT "hr_worker_profiles_person_id_hr_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."hr_people"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_org_units" ADD CONSTRAINT "hr_org_units_manager_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("manager_worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_positions" ADD CONSTRAINT "hr_positions_job_family_id_hr_job_families_id_fk" FOREIGN KEY ("job_family_id") REFERENCES "public"."hr_job_families"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_positions" ADD CONSTRAINT "hr_positions_job_level_id_hr_job_levels_id_fk" FOREIGN KEY ("job_level_id") REFERENCES "public"."hr_job_levels"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_positions" ADD CONSTRAINT "hr_positions_org_unit_id_hr_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."hr_org_units"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_documents" ADD CONSTRAINT "hr_documents_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_worker_certifications" ADD CONSTRAINT "hr_worker_certifications_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_worker_skills" ADD CONSTRAINT "hr_worker_skills_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_workspace_assignments" ADD CONSTRAINT "hr_workspace_assignments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_workspace_assignments" ADD CONSTRAINT "hr_workspace_assignments_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_candidates" ADD CONSTRAINT "hr_candidates_recruitment_request_id_hr_recruitment_requests_id_fk" FOREIGN KEY ("recruitment_request_id") REFERENCES "public"."hr_recruitment_requests"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_interviews" ADD CONSTRAINT "hr_interviews_candidate_id_hr_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."hr_candidates"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_interviews" ADD CONSTRAINT "hr_interviews_recruitment_request_id_hr_recruitment_requests_id_fk" FOREIGN KEY ("recruitment_request_id") REFERENCES "public"."hr_recruitment_requests"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_interviews" ADD CONSTRAINT "hr_interviews_interviewer_id_hr_worker_profiles_id_fk" FOREIGN KEY ("interviewer_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_offers" ADD CONSTRAINT "hr_offers_candidate_id_hr_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."hr_candidates"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_offers" ADD CONSTRAINT "hr_offers_recruitment_request_id_hr_recruitment_requests_id_fk" FOREIGN KEY ("recruitment_request_id") REFERENCES "public"."hr_recruitment_requests"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_offers" ADD CONSTRAINT "hr_offers_position_id_hr_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."hr_positions"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_recruitment_requests" ADD CONSTRAINT "hr_recruitment_requests_position_id_hr_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."hr_positions"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_recruitment_requests" ADD CONSTRAINT "hr_recruitment_requests_org_unit_id_hr_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."hr_org_units"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_recruitment_requests" ADD CONSTRAINT "hr_recruitment_requests_hiring_manager_id_hr_worker_profiles_id_fk" FOREIGN KEY ("hiring_manager_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_exit_interviews" ADD CONSTRAINT "hr_exit_interviews_offboarding_case_id_hr_offboarding_cases_id_fk" FOREIGN KEY ("offboarding_case_id") REFERENCES "public"."hr_offboarding_cases"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_exit_interviews" ADD CONSTRAINT "hr_exit_interviews_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_exit_interviews" ADD CONSTRAINT "hr_exit_interviews_interviewer_id_hr_worker_profiles_id_fk" FOREIGN KEY ("interviewer_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_knowledge_transfer_items" ADD CONSTRAINT "hr_knowledge_transfer_items_offboarding_case_id_hr_offboarding_cases_id_fk" FOREIGN KEY ("offboarding_case_id") REFERENCES "public"."hr_offboarding_cases"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_knowledge_transfer_items" ADD CONSTRAINT "hr_knowledge_transfer_items_recipient_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("recipient_worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_offboarding_cases" ADD CONSTRAINT "hr_offboarding_cases_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_offboarding_tasks" ADD CONSTRAINT "hr_offboarding_tasks_case_id_hr_offboarding_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."hr_offboarding_cases"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_offboarding_tasks" ADD CONSTRAINT "hr_offboarding_tasks_assignee_id_hr_worker_profiles_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_onboarding_cases" ADD CONSTRAINT "hr_onboarding_cases_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_onboarding_cases" ADD CONSTRAINT "hr_onboarding_cases_candidate_id_hr_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."hr_candidates"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_onboarding_cases" ADD CONSTRAINT "hr_onboarding_cases_offer_id_hr_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."hr_offers"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_onboarding_cases" ADD CONSTRAINT "hr_onboarding_cases_position_id_hr_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."hr_positions"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_onboarding_cases" ADD CONSTRAINT "hr_onboarding_cases_org_unit_id_hr_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."hr_org_units"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_onboarding_cases" ADD CONSTRAINT "hr_onboarding_cases_manager_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("manager_worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_onboarding_tasks" ADD CONSTRAINT "hr_onboarding_tasks_case_id_hr_onboarding_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."hr_onboarding_cases"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_onboarding_tasks" ADD CONSTRAINT "hr_onboarding_tasks_assignee_id_hr_worker_profiles_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_leave_balances" ADD CONSTRAINT "hr_leave_balances_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_leave_balances" ADD CONSTRAINT "hr_leave_balances_leave_type_id_hr_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."hr_leave_types"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_leave_requests" ADD CONSTRAINT "hr_leave_requests_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_leave_requests" ADD CONSTRAINT "hr_leave_requests_leave_type_id_hr_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."hr_leave_types"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_leave_requests" ADD CONSTRAINT "hr_leave_requests_approved_by_hr_worker_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_overtime_requests" ADD CONSTRAINT "hr_overtime_requests_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_overtime_requests" ADD CONSTRAINT "hr_overtime_requests_approved_by_hr_worker_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_shift_assignments" ADD CONSTRAINT "hr_shift_assignments_shift_plan_id_hr_shift_plans_id_fk" FOREIGN KEY ("shift_plan_id") REFERENCES "public"."hr_shift_plans"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_shift_assignments" ADD CONSTRAINT "hr_shift_assignments_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_shift_plans" ADD CONSTRAINT "hr_shift_plans_org_unit_id_hr_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."hr_org_units"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_time_entries" ADD CONSTRAINT "hr_time_entries_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_time_entries" ADD CONSTRAINT "hr_time_entries_approved_by_hr_worker_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_employee_certifications" ADD CONSTRAINT "hr_employee_certifications_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_employee_certifications" ADD CONSTRAINT "hr_employee_certifications_certification_id_hr_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."hr_certifications"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_learning_assignments" ADD CONSTRAINT "hr_learning_assignments_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_learning_assignments" ADD CONSTRAINT "hr_learning_assignments_training_id_hr_training_catalog_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."hr_training_catalog"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_learning_assignments" ADD CONSTRAINT "hr_learning_assignments_assigned_by_hr_worker_profiles_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_learning_history" ADD CONSTRAINT "hr_learning_history_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_learning_history" ADD CONSTRAINT "hr_learning_history_training_id_hr_training_catalog_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."hr_training_catalog"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_mandatory_training_rules" ADD CONSTRAINT "hr_mandatory_training_rules_training_id_hr_training_catalog_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."hr_training_catalog"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_goals" ADD CONSTRAINT "hr_goals_cycle_id_hr_performance_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."hr_performance_cycles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_goals" ADD CONSTRAINT "hr_goals_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_performance_reviews" ADD CONSTRAINT "hr_performance_reviews_cycle_id_hr_performance_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."hr_performance_cycles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_performance_reviews" ADD CONSTRAINT "hr_performance_reviews_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_performance_reviews" ADD CONSTRAINT "hr_performance_reviews_reviewer_id_hr_worker_profiles_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_benefit_enrollments" ADD CONSTRAINT "hr_benefit_enrollments_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_benefit_enrollments" ADD CONSTRAINT "hr_benefit_enrollments_benefit_plan_id_hr_benefit_plans_id_fk" FOREIGN KEY ("benefit_plan_id") REFERENCES "public"."hr_benefit_plans"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_bonus_records" ADD CONSTRAINT "hr_bonus_records_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_bonus_records" ADD CONSTRAINT "hr_bonus_records_approved_by_hr_worker_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_compensation_records" ADD CONSTRAINT "hr_compensation_records_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_compensation_records" ADD CONSTRAINT "hr_compensation_records_salary_band_id_hr_salary_bands_id_fk" FOREIGN KEY ("salary_band_id") REFERENCES "public"."hr_salary_bands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_disciplinary_actions" ADD CONSTRAINT "hr_disciplinary_actions_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_disciplinary_actions" ADD CONSTRAINT "hr_disciplinary_actions_issued_by_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("issued_by_worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_disciplinary_actions" ADD CONSTRAINT "hr_disciplinary_actions_related_grievance_id_hr_grievances_id_fk" FOREIGN KEY ("related_grievance_id") REFERENCES "public"."hr_grievances"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_grievances" ADD CONSTRAINT "hr_grievances_filed_by_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("filed_by_worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_grievances" ADD CONSTRAINT "hr_grievances_against_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("against_worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_grievances" ADD CONSTRAINT "hr_grievances_assigned_to_id_hr_worker_profiles_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_investigations" ADD CONSTRAINT "hr_investigations_related_grievance_id_hr_grievances_id_fk" FOREIGN KEY ("related_grievance_id") REFERENCES "public"."hr_grievances"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_investigations" ADD CONSTRAINT "hr_investigations_investigator_id_hr_worker_profiles_id_fk" FOREIGN KEY ("investigator_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_investigations" ADD CONSTRAINT "hr_investigations_subject_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("subject_worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_policy_acknowledgements" ADD CONSTRAINT "hr_policy_acknowledgements_policy_id_hr_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."hr_policies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_policy_acknowledgements" ADD CONSTRAINT "hr_policy_acknowledgements_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_recognition_events" ADD CONSTRAINT "hr_recognition_events_program_id_hr_recognition_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."hr_recognition_programs"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_recognition_events" ADD CONSTRAINT "hr_recognition_events_recipient_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("recipient_worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_recognition_events" ADD CONSTRAINT "hr_recognition_events_nominated_by_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("nominated_by_worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_survey_responses" ADD CONSTRAINT "hr_survey_responses_campaign_id_hr_survey_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."hr_survey_campaigns"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_survey_responses" ADD CONSTRAINT "hr_survey_responses_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_compliance_evidence" ADD CONSTRAINT "hr_compliance_evidence_obligation_id_hr_compliance_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."hr_compliance_obligations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_compliance_evidence" ADD CONSTRAINT "hr_compliance_evidence_recorded_by_hr_worker_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_compliance_obligations" ADD CONSTRAINT "hr_compliance_obligations_owner_id_hr_worker_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_incident_reports" ADD CONSTRAINT "hr_incident_reports_reported_by_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("reported_by_worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_incident_reports" ADD CONSTRAINT "hr_incident_reports_affected_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("affected_worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_incident_reports" ADD CONSTRAINT "hr_incident_reports_assigned_to_id_hr_worker_profiles_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_risk_items" ADD CONSTRAINT "hr_risk_items_owner_id_hr_worker_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_succession_candidates" ADD CONSTRAINT "hr_succession_candidates_succession_plan_id_hr_succession_plans_id_fk" FOREIGN KEY ("succession_plan_id") REFERENCES "public"."hr_succession_plans"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_succession_candidates" ADD CONSTRAINT "hr_succession_candidates_candidate_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("candidate_worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_succession_plans" ADD CONSTRAINT "hr_succession_plans_position_id_hr_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."hr_positions"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_succession_plans" ADD CONSTRAINT "hr_succession_plans_current_incumbent_id_hr_worker_profiles_id_fk" FOREIGN KEY ("current_incumbent_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_talent_reviews" ADD CONSTRAINT "hr_talent_reviews_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hr_talent_reviews" ADD CONSTRAINT "hr_talent_reviews_reviewer_id_hr_worker_profiles_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provider_version_provider_id" ON "provider_versions" USING btree ("providerId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_provider_version" ON "provider_versions" USING btree ("providerId","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_execution_runs_entry" ON "execution_runs" USING btree ("catalogEntryId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_execution_runs_conversation" ON "execution_runs" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_execution_runs_state" ON "execution_runs" USING btree ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_execution_runs_started" ON "execution_runs" USING btree ("startedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bot_version_bot_id" ON "bot_versions" USING btree ("botId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_bot_version" ON "bot_versions" USING btree ("botId","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bot_name" ON "bots" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bot_status" ON "bots" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_audit_action_idx" ON "hr_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_audit_worker_idx" ON "hr_audit_log" USING btree ("target_worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_employment_worker_idx" ON "hr_employment_records" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_employment_status_idx" ON "hr_employment_records" USING btree ("employment_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_people_email_idx" ON "hr_people" USING btree ("primary_email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_people_tenant_idx" ON "hr_people" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_people_status_idx" ON "hr_people" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_role_user_idx" ON "hr_role_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_role_worker_idx" ON "hr_role_assignments" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_role_role_idx" ON "hr_role_assignments" USING btree ("hr_role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_worker_person_idx" ON "hr_worker_profiles" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_worker_emp_number_idx" ON "hr_worker_profiles" USING btree ("employee_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_worker_manager_idx" ON "hr_worker_profiles" USING btree ("manager_worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_worker_status_idx" ON "hr_worker_profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_org_parent_idx" ON "hr_org_units" USING btree ("parent_org_unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_org_code_idx" ON "hr_org_units" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_org_tenant_idx" ON "hr_org_units" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_position_org_idx" ON "hr_positions" USING btree ("org_unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_position_code_idx" ON "hr_positions" USING btree ("position_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_position_status_idx" ON "hr_positions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_doc_worker_idx" ON "hr_documents" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_doc_type_idx" ON "hr_documents" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_cert_worker_idx" ON "hr_worker_certifications" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_skill_worker_idx" ON "hr_worker_skills" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_skill_name_idx" ON "hr_worker_skills" USING btree ("skill_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_assign_workspace_idx" ON "hr_workspace_assignments" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_assign_worker_idx" ON "hr_workspace_assignments" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_assign_active_idx" ON "hr_workspace_assignments" USING btree ("workspace_id","worker_id","role_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_candidate_req_idx" ON "hr_candidates" USING btree ("recruitment_request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_candidate_stage_idx" ON "hr_candidates" USING btree ("pipeline_stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_candidate_email_idx" ON "hr_candidates" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_interview_candidate_idx" ON "hr_interviews" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_interview_req_idx" ON "hr_interviews" USING btree ("recruitment_request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_interview_status_idx" ON "hr_interviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_offer_candidate_idx" ON "hr_offers" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_offer_req_idx" ON "hr_offers" USING btree ("recruitment_request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_offer_status_idx" ON "hr_offers" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_recruit_req_status_idx" ON "hr_recruitment_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_recruit_req_manager_idx" ON "hr_recruitment_requests" USING btree ("hiring_manager_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_recruit_req_position_idx" ON "hr_recruitment_requests" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_exit_int_case_idx" ON "hr_exit_interviews" USING btree ("offboarding_case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_exit_int_worker_idx" ON "hr_exit_interviews" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_kt_case_idx" ON "hr_knowledge_transfer_items" USING btree ("offboarding_case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_kt_recipient_idx" ON "hr_knowledge_transfer_items" USING btree ("recipient_worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_lc_event_entity_idx" ON "hr_lifecycle_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_lc_event_type_idx" ON "hr_lifecycle_events" USING btree ("event");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_offboard_worker_idx" ON "hr_offboarding_cases" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_offboard_status_idx" ON "hr_offboarding_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_offboard_task_case_idx" ON "hr_offboarding_tasks" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_offboard_task_status_idx" ON "hr_offboarding_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_offboard_task_cat_idx" ON "hr_offboarding_tasks" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_onboard_worker_idx" ON "hr_onboarding_cases" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_onboard_status_idx" ON "hr_onboarding_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_onboard_candidate_idx" ON "hr_onboarding_cases" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_onboard_task_case_idx" ON "hr_onboarding_tasks" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_onboard_task_status_idx" ON "hr_onboarding_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_onboard_task_cat_idx" ON "hr_onboarding_tasks" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_onboard_task_assignee_idx" ON "hr_onboarding_tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_leave_bal_worker_year_idx" ON "hr_leave_balances" USING btree ("worker_id","year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_leave_bal_type_idx" ON "hr_leave_balances" USING btree ("leave_type_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_leave_req_worker_idx" ON "hr_leave_requests" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_leave_req_status_idx" ON "hr_leave_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_leave_req_date_idx" ON "hr_leave_requests" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_leave_req_type_idx" ON "hr_leave_requests" USING btree ("leave_type_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_overtime_worker_idx" ON "hr_overtime_requests" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_overtime_status_idx" ON "hr_overtime_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_overtime_date_idx" ON "hr_overtime_requests" USING btree ("request_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_shift_assign_shift_idx" ON "hr_shift_assignments" USING btree ("shift_plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_shift_assign_worker_idx" ON "hr_shift_assignments" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_shift_assign_date_idx" ON "hr_shift_assignments" USING btree ("assigned_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_shift_plan_org_idx" ON "hr_shift_plans" USING btree ("org_unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_shift_plan_status_idx" ON "hr_shift_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_shift_plan_date_idx" ON "hr_shift_plans" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_time_worker_idx" ON "hr_time_entries" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_time_date_idx" ON "hr_time_entries" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_time_status_idx" ON "hr_time_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_time_worker_date_idx" ON "hr_time_entries" USING btree ("worker_id","entry_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_emp_cert_worker_idx" ON "hr_employee_certifications" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_emp_cert_cert_idx" ON "hr_employee_certifications" USING btree ("certification_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_emp_cert_status_idx" ON "hr_employee_certifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_emp_cert_expiry_idx" ON "hr_employee_certifications" USING btree ("expiry_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_learning_assign_worker_idx" ON "hr_learning_assignments" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_learning_assign_training_idx" ON "hr_learning_assignments" USING btree ("training_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_learning_assign_status_idx" ON "hr_learning_assignments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_learning_assign_due_idx" ON "hr_learning_assignments" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_learning_hist_worker_idx" ON "hr_learning_history" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_learning_hist_training_idx" ON "hr_learning_history" USING btree ("training_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_learning_hist_valid_idx" ON "hr_learning_history" USING btree ("valid_until");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_mandatory_training_idx" ON "hr_mandatory_training_rules" USING btree ("training_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_mandatory_target_idx" ON "hr_mandatory_training_rules" USING btree ("target_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_training_cat_idx" ON "hr_training_catalog" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_training_mandatory_idx" ON "hr_training_catalog" USING btree ("is_mandatory");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_goal_cycle_idx" ON "hr_goals" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_goal_worker_idx" ON "hr_goals" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_goal_status_idx" ON "hr_goals" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_perf_cycle_status_idx" ON "hr_performance_cycles" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_perf_cycle_date_idx" ON "hr_performance_cycles" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_review_cycle_idx" ON "hr_performance_reviews" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_review_worker_idx" ON "hr_performance_reviews" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_review_reviewer_idx" ON "hr_performance_reviews" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_review_status_idx" ON "hr_performance_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_benefit_enroll_worker_idx" ON "hr_benefit_enrollments" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_benefit_enroll_plan_idx" ON "hr_benefit_enrollments" USING btree ("benefit_plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_benefit_enroll_status_idx" ON "hr_benefit_enrollments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_benefit_plan_cat_idx" ON "hr_benefit_plans" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_bonus_worker_idx" ON "hr_bonus_records" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_bonus_status_idx" ON "hr_bonus_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_bonus_type_idx" ON "hr_bonus_records" USING btree ("bonus_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_comp_worker_idx" ON "hr_compensation_records" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_comp_status_idx" ON "hr_compensation_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_comp_date_idx" ON "hr_compensation_records" USING btree ("effective_from");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_salary_band_level_idx" ON "hr_salary_bands" USING btree ("job_level");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_salary_band_family_idx" ON "hr_salary_bands" USING btree ("job_family");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_sal_review_status_idx" ON "hr_salary_review_cycles" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_disciplinary_worker_idx" ON "hr_disciplinary_actions" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_disciplinary_status_idx" ON "hr_disciplinary_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_disciplinary_type_idx" ON "hr_disciplinary_actions" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_grievance_filed_by_idx" ON "hr_grievances" USING btree ("filed_by_worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_grievance_status_idx" ON "hr_grievances" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_grievance_severity_idx" ON "hr_grievances" USING btree ("severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_grievance_assigned_idx" ON "hr_grievances" USING btree ("assigned_to_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_investigation_status_idx" ON "hr_investigations" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_investigation_investigator_idx" ON "hr_investigations" USING btree ("investigator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_investigation_subject_idx" ON "hr_investigations" USING btree ("subject_worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_policy_status_idx" ON "hr_policies" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_policy_category_idx" ON "hr_policies" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_policy_ack_policy_idx" ON "hr_policy_acknowledgements" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_policy_ack_worker_idx" ON "hr_policy_acknowledgements" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_policy_ack_status_idx" ON "hr_policy_acknowledgements" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_engagement_prog_status_idx" ON "hr_engagement_programs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_recognition_recipient_idx" ON "hr_recognition_events" USING btree ("recipient_worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_recognition_program_idx" ON "hr_recognition_events" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_recognition_status_idx" ON "hr_recognition_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_survey_campaign_status_idx" ON "hr_survey_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_survey_campaign_type_idx" ON "hr_survey_campaigns" USING btree ("survey_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_survey_resp_campaign_idx" ON "hr_survey_responses" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_survey_resp_worker_idx" ON "hr_survey_responses" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_wellbeing_cat_idx" ON "hr_wellbeing_resources" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_compliance_ev_obl_idx" ON "hr_compliance_evidence" USING btree ("obligation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_compliance_obl_status_idx" ON "hr_compliance_obligations" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_compliance_obl_cat_idx" ON "hr_compliance_obligations" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_compliance_obl_due_idx" ON "hr_compliance_obligations" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_incident_status_idx" ON "hr_incident_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_incident_severity_idx" ON "hr_incident_reports" USING btree ("severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_incident_category_idx" ON "hr_incident_reports" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_incident_date_idx" ON "hr_incident_reports" USING btree ("incident_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_risk_status_idx" ON "hr_risk_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_risk_category_idx" ON "hr_risk_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_risk_owner_idx" ON "hr_risk_items" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_metric_snap_name_idx" ON "hr_metric_snapshots" USING btree ("metric_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_metric_snap_cat_idx" ON "hr_metric_snapshots" USING btree ("metric_category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_metric_snap_period_idx" ON "hr_metric_snapshots" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_report_def_cat_idx" ON "hr_report_definitions" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_succession_cand_plan_idx" ON "hr_succession_candidates" USING btree ("succession_plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_succession_cand_worker_idx" ON "hr_succession_candidates" USING btree ("candidate_worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_succession_cand_status_idx" ON "hr_succession_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_succession_position_idx" ON "hr_succession_plans" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_succession_status_idx" ON "hr_succession_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_succession_criticality_idx" ON "hr_succession_plans" USING btree ("criticality");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_talent_review_worker_idx" ON "hr_talent_reviews" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_talent_review_status_idx" ON "hr_talent_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hr_talent_review_date_idx" ON "hr_talent_reviews" USING btree ("review_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_catalog_entry_source" ON "catalog_entries" USING btree ("sourceType","sourceId");