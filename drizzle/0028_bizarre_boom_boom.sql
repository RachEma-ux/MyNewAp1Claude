CREATE TABLE "hr_letters" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"letter_type" varchar(100) NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text,
	"reference_number" varchar(100),
	"issue_date" date,
	"expiry_date" date,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"document_ref" varchar(500),
	"template_id" varchar(100),
	"metadata" json,
	"issued_by" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_work_permits" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"permit_type" varchar(100) NOT NULL,
	"permit_number" varchar(200),
	"issuing_country" varchar(100),
	"issuing_authority" varchar(300),
	"issue_date" date,
	"expiry_date" date,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"notes" text,
	"document_ref" varchar(500),
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_position_role_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"position_id" integer NOT NULL,
	"role_definition_id" integer NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	"linked_by" integer,
	"unlinked_at" timestamp,
	"unlinked_by" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_role_definition_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_id" integer NOT NULL,
	"reviewer_id" integer NOT NULL,
	"outcome" varchar(30) NOT NULL,
	"comments" text,
	"reviewed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_role_definition_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_definition_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"change_type" varchar(30) DEFAULT 'material',
	"change_reason" text,
	"title" varchar(300) NOT NULL,
	"purpose_summary" text,
	"reports_to_description" varchar(300),
	"reports_to_role_definition_id" integer,
	"direct_reports_scope" text,
	"location_scope" varchar(300),
	"employment_type" varchar(50),
	"accountabilities" json,
	"decision_rights_independent" json,
	"decision_rights_recommend" json,
	"decision_rights_escalate" json,
	"boundaries_in_scope" json,
	"boundaries_out_of_scope" json,
	"escalation_triggers" json,
	"collaboration_interfaces" json,
	"required_technical_skills" json,
	"required_behavioral_skills" json,
	"required_education" json,
	"required_experience" json,
	"preferred_qualifications" json,
	"success_metrics" json,
	"visibility_class" varchar(30) DEFAULT 'public_internal' NOT NULL,
	"sensitivity_notes" text,
	"compliance_notes" text,
	"sod_constraints" text,
	"compensation_notes" text,
	"succession_notes" text,
	"restructuring_notes" text,
	"effective_from" date,
	"effective_to" date,
	"owner_id" integer,
	"reviewed_by_id" integer,
	"approved_by_id" integer,
	"approved_at" timestamp,
	"published_at" timestamp,
	"published_by_id" integer,
	"last_reviewed_at" timestamp,
	"next_review_at" date,
	"superseded_by_id" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hr_roledefver_version_uniq" UNIQUE("role_definition_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "hr_role_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" varchar(100) DEFAULT 'default' NOT NULL,
	"role_code" varchar(80) NOT NULL,
	"title" varchar(300) NOT NULL,
	"org_unit_id" integer,
	"job_family_id" integer,
	"job_level_id" integer,
	"current_version_id" integer,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hr_roledef_code_uniq" UNIQUE("tenant_id","role_code")
);
--> statement-breakpoint
CREATE TABLE "resource_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"position_id" integer,
	"project_id" integer NOT NULL,
	"wbs_id" integer,
	"project_role" varchar(100) NOT NULL,
	"function_id" integer,
	"allocation_percent" integer DEFAULT 100 NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"approved_by" integer,
	"approval_status" varchar(30) DEFAULT 'pending' NOT NULL,
	"cost_rate_source" varchar(50),
	"utilization_state" varchar(30) DEFAULT 'untracked',
	"authority_chain" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"wbs_id" integer,
	"requested_role" varchar(100) NOT NULL,
	"required_skill" varchar(200),
	"required_level" varchar(30),
	"allocation_percent" integer DEFAULT 100 NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"location_mode" varchar(30) DEFAULT 'any',
	"budget_limit" integer,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"requester_id" integer NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "om_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"actor_id" integer,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer,
	"previous_value" json,
	"new_value" json,
	"category" varchar(30) DEFAULT 'mutation' NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "om_cost_centers" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"legal_entity_id" integer,
	"parent_cost_center_id" integer,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"metadata" json,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "om_cost_center_code_uniq" UNIQUE("workspace_id","code")
);
--> statement-breakpoint
CREATE TABLE "om_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"family" varchar(100),
	"level" varchar(50),
	"level_rank" integer DEFAULT 0,
	"description" text,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"metadata" json,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "om_job_code_uniq" UNIQUE("workspace_id","code")
);
--> statement-breakpoint
CREATE TABLE "om_legal_entities" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" varchar(50) DEFAULT 'company' NOT NULL,
	"parent_entity_id" integer,
	"country" varchar(100),
	"registration_number" varchar(100),
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"metadata" json,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "om_legal_entity_code_uniq" UNIQUE("workspace_id","code")
);
--> statement-breakpoint
CREATE TABLE "om_org_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"structure_model" varchar(50) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"snapshot" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "om_template_name_uniq" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "om_org_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" varchar(50) DEFAULT 'department' NOT NULL,
	"parent_org_unit_id" integer,
	"legal_entity_id" integer,
	"cost_center_id" integer,
	"manager_position_id" integer,
	"level" integer DEFAULT 0 NOT NULL,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"metadata" json,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "om_org_unit_code_uniq" UNIQUE("workspace_id","code")
);
--> statement-breakpoint
CREATE TABLE "om_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"position_code" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"job_id" integer,
	"org_unit_id" integer,
	"reports_to_position_id" integer,
	"legal_entity_id" integer,
	"cost_center_id" integer,
	"budgeted" boolean DEFAULT true NOT NULL,
	"headcount_limit" integer DEFAULT 1 NOT NULL,
	"status" varchar(30) DEFAULT 'vacant' NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"metadata" json,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "om_position_code_uniq" UNIQUE("workspace_id","position_code")
);
--> statement-breakpoint
CREATE TABLE "om_reporting_relationships" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"position_id" integer NOT NULL,
	"reports_to_position_id" integer NOT NULL,
	"type" varchar(30) DEFAULT 'direct' NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"metadata" json,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "om_reporting_primary_uniq" UNIQUE("position_id","type","is_primary")
);
--> statement-breakpoint
CREATE TABLE "om_structure_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"snapshot" json,
	"published_at" timestamp,
	"published_by" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "om_structure_version_uniq" UNIQUE("workspace_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "cv_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"actor_id" integer,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer,
	"previous_value" json,
	"new_value" json,
	"category" varchar(30) DEFAULT 'mutation' NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cv_behavior_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"value_definition_id" integer NOT NULL,
	"behavior" text NOT NULL,
	"level" varchar(30) DEFAULT 'standard' NOT NULL,
	"context" varchar(100),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"metadata" json,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cv_non_negotiables" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"value_definition_id" integer NOT NULL,
	"description" text NOT NULL,
	"severity" varchar(30) DEFAULT 'critical' NOT NULL,
	"category" varchar(50) DEFAULT 'red_flag' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"metadata" json,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cv_operationalization" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"value_definition_id" integer,
	"value_set_id" integer,
	"type" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"content" json,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"metadata" json,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cv_value_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"value_set_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"type" varchar(30) DEFAULT 'core' NOT NULL,
	"category" varchar(100),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"icon" varchar(50),
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"metadata" json,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cv_value_def_code_uniq" UNIQUE("workspace_id","value_set_id","code")
);
--> statement-breakpoint
CREATE TABLE "cv_value_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"published_at" timestamp,
	"published_by" integer,
	"created_by" integer,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cv_value_set_version_uniq" UNIQUE("workspace_id","version")
);
--> statement-breakpoint
CREATE TABLE "cv_value_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"value_definition_id" integer NOT NULL,
	"unit_type" varchar(50) NOT NULL,
	"unit_identifier" varchar(200) NOT NULL,
	"translation" text NOT NULL,
	"examples" json,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"metadata" json,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer,
	"actor_id" integer,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50),
	"entity_id" integer,
	"previous_value" json,
	"new_value" json,
	"category" varchar(50) DEFAULT 'mutation',
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_catalog_system_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"system_type" varchar(100) NOT NULL,
	"label" varchar(200) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ps_catalog_type_uniq" UNIQUE("system_type")
);
--> statement-breakpoint
CREATE TABLE "ps_matrix_cells" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_id" integer NOT NULL,
	"question_id" integer NOT NULL,
	"scope_id" integer NOT NULL,
	"weight" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ps_matrix_cells_uniq" UNIQUE("version_id","question_id","scope_id")
);
--> statement-breakpoint
CREATE TABLE "ps_matrix_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"version_id" integer,
	"import_type" varchar(20),
	"source_type" varchar(30) NOT NULL,
	"source_name" varchar(255),
	"sheet_name" varchar(255),
	"raw_payload_json" json,
	"import_status" varchar(30) DEFAULT 'pending' NOT NULL,
	"total_rows" integer DEFAULT 0,
	"imported_rows" integer DEFAULT 0,
	"skipped_rows" integer DEFAULT 0,
	"scopes_count" integer DEFAULT 0,
	"questions_count" integer DEFAULT 0,
	"cells_count" integer DEFAULT 0,
	"warnings_json" json,
	"errors_json" json,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"committed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ps_matrix_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_id" integer NOT NULL,
	"code" varchar(100) NOT NULL,
	"label" varchar(500) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ps_matrix_questions_code_uniq" UNIQUE("version_id","code")
);
--> statement-breakpoint
CREATE TABLE "ps_matrix_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"version" varchar(50) NOT NULL,
	"label" varchar(255) NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"source_type" varchar(20),
	"source_name" varchar(255),
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"activated_at" timestamp,
	CONSTRAINT "ps_matrix_versions_uniq" UNIQUE("workspace_id","version")
);
--> statement-breakpoint
CREATE TABLE "ps_resource_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"resource_request_id" integer NOT NULL,
	"ps_system_id" integer NOT NULL,
	"assignment_role" varchar(200) NOT NULL,
	"assignee_ref_type" varchar(50) NOT NULL,
	"assignee_ref_id" varchar(200),
	"assignee_display_name" varchar(300),
	"allocation_percentage" integer DEFAULT 100,
	"start_date" timestamp,
	"end_date" timestamp,
	"status" varchar(30) DEFAULT 'proposed' NOT NULL,
	"source" varchar(50) DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_resource_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"ps_system_id" integer NOT NULL,
	"role" varchar(200) NOT NULL,
	"capability_tags" json DEFAULT '[]'::json,
	"quantity" integer DEFAULT 1 NOT NULL,
	"seniority_level" varchar(50) DEFAULT 'mid',
	"start_date" timestamp,
	"end_date" timestamp,
	"allocation_percentage" integer DEFAULT 100,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_scope_matrix_headers" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_id" integer NOT NULL,
	"header_key" varchar(120) NOT NULL,
	"header_label" varchar(255) NOT NULL,
	"header_type" varchar(50),
	"is_active" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ps_scope_matrix_headers_key_uniq" UNIQUE("version_id","header_key")
);
--> statement-breakpoint
CREATE TABLE "ps_scope_matrix_profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope_id" integer NOT NULL,
	"pmi_value" varchar(255),
	"prince2_value" varchar(255),
	"iso_value" varchar(255),
	"ipma_value" varchar(255),
	"cmmi_value" varchar(255),
	"aspice_value" varchar(255),
	"lean_method_value" varchar(255),
	"agile_framework_value" varchar(255),
	"traditional_method_value" varchar(255),
	"agile_frameworks_value" varchar(255),
	"hybrid_method_value" varchar(255),
	"case_scenario" text,
	"selected_standards" varchar(255),
	"selected_frameworks" varchar(255),
	"raw_row_json" json,
	"type_map_json" json DEFAULT '{}'::json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ps_scope_matrix_profile_scope_uniq" UNIQUE("scope_id")
);
--> statement-breakpoint
CREATE TABLE "ps_scope_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_id" integer NOT NULL,
	"code" varchar(120) NOT NULL,
	"label" varchar(255) NOT NULL,
	"description" text,
	"family" varchar(120),
	"is_active" integer DEFAULT 1 NOT NULL,
	"source_row_number" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ps_scope_registry_code_uniq" UNIQUE("version_id","code")
);
--> statement-breakpoint
CREATE TABLE "ps_systems" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"system_type" varchar(100) NOT NULL,
	"lifecycle_type" varchar(100),
	"governance_profile" varchar(100),
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ps_systems_name_uniq" UNIQUE("workspace_id","name")
);
--> statement-breakpoint
CREATE TABLE "ps_wizard_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"scenario_text" text NOT NULL,
	"input_payload" json,
	"result_payload" json,
	"confidence" numeric(5, 2),
	"selected_system_type" varchar(100),
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "purposeStatement" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "wizardMeta" json;--> statement-breakpoint
ALTER TABLE "hr_letters" ADD CONSTRAINT "hr_letters_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_work_permits" ADD CONSTRAINT "hr_work_permits_worker_id_hr_worker_profiles_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."hr_worker_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_position_role_links" ADD CONSTRAINT "hr_position_role_links_position_id_hr_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."hr_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_position_role_links" ADD CONSTRAINT "hr_position_role_links_role_definition_id_hr_role_definitions_id_fk" FOREIGN KEY ("role_definition_id") REFERENCES "public"."hr_role_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_role_definition_reviews" ADD CONSTRAINT "hr_role_definition_reviews_version_id_hr_role_definition_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."hr_role_definition_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_role_definition_versions" ADD CONSTRAINT "hr_role_definition_versions_role_definition_id_hr_role_definitions_id_fk" FOREIGN KEY ("role_definition_id") REFERENCES "public"."hr_role_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_role_definitions" ADD CONSTRAINT "hr_role_definitions_org_unit_id_hr_org_units_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."hr_org_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_role_definitions" ADD CONSTRAINT "hr_role_definitions_job_family_id_hr_job_families_id_fk" FOREIGN KEY ("job_family_id") REFERENCES "public"."hr_job_families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_role_definitions" ADD CONSTRAINT "hr_role_definitions_job_level_id_hr_job_levels_id_fk" FOREIGN KEY ("job_level_id") REFERENCES "public"."hr_job_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hr_letters_worker_idx" ON "hr_letters" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "hr_letters_type_idx" ON "hr_letters" USING btree ("letter_type");--> statement-breakpoint
CREATE INDEX "hr_letters_status_idx" ON "hr_letters" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hr_letters_ref_idx" ON "hr_letters" USING btree ("reference_number");--> statement-breakpoint
CREATE INDEX "hr_work_permit_worker_idx" ON "hr_work_permits" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "hr_work_permit_expiry_idx" ON "hr_work_permits" USING btree ("expiry_date");--> statement-breakpoint
CREATE INDEX "hr_work_permit_status_idx" ON "hr_work_permits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hr_work_permit_type_idx" ON "hr_work_permits" USING btree ("permit_type");--> statement-breakpoint
CREATE INDEX "hr_posrole_position_idx" ON "hr_position_role_links" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "hr_posrole_roledef_idx" ON "hr_position_role_links" USING btree ("role_definition_id");--> statement-breakpoint
CREATE INDEX "hr_posrole_active_idx" ON "hr_position_role_links" USING btree ("position_id","is_active");--> statement-breakpoint
CREATE INDEX "hr_roledefrev_version_idx" ON "hr_role_definition_reviews" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "hr_roledefrev_reviewer_idx" ON "hr_role_definition_reviews" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "hr_roledefver_roledef_idx" ON "hr_role_definition_versions" USING btree ("role_definition_id");--> statement-breakpoint
CREATE INDEX "hr_roledefver_status_idx" ON "hr_role_definition_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hr_roledefver_effective_idx" ON "hr_role_definition_versions" USING btree ("effective_from","effective_to");--> statement-breakpoint
CREATE INDEX "hr_roledef_code_idx" ON "hr_role_definitions" USING btree ("role_code");--> statement-breakpoint
CREATE INDEX "hr_roledef_tenant_idx" ON "hr_role_definitions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "hr_roledef_org_idx" ON "hr_role_definitions" USING btree ("org_unit_id");--> statement-breakpoint
CREATE INDEX "hr_roledef_family_idx" ON "hr_role_definitions" USING btree ("job_family_id");--> statement-breakpoint
CREATE INDEX "hr_roledef_status_idx" ON "hr_role_definitions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ra_request_idx" ON "resource_assignments" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "ra_employee_idx" ON "resource_assignments" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "ra_project_idx" ON "resource_assignments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ra_status_idx" ON "resource_assignments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rr_project_idx" ON "resource_requests" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "rr_status_idx" ON "resource_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rr_requester_idx" ON "resource_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "om_audit_ws_idx" ON "om_audit_log" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "om_audit_entity_type_idx" ON "om_audit_log" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "om_audit_action_idx" ON "om_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "om_audit_actor_idx" ON "om_audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "om_audit_created_idx" ON "om_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "om_cost_center_ws_idx" ON "om_cost_centers" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "om_cost_center_code_idx" ON "om_cost_centers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "om_cost_center_entity_idx" ON "om_cost_centers" USING btree ("legal_entity_id");--> statement-breakpoint
CREATE INDEX "om_job_ws_idx" ON "om_jobs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "om_job_code_idx" ON "om_jobs" USING btree ("code");--> statement-breakpoint
CREATE INDEX "om_job_family_idx" ON "om_jobs" USING btree ("family");--> statement-breakpoint
CREATE INDEX "om_job_status_idx" ON "om_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "om_legal_entity_ws_idx" ON "om_legal_entities" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "om_legal_entity_code_idx" ON "om_legal_entities" USING btree ("code");--> statement-breakpoint
CREATE INDEX "om_legal_entity_status_idx" ON "om_legal_entities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "om_template_model_idx" ON "om_org_templates" USING btree ("structure_model");--> statement-breakpoint
CREATE INDEX "om_org_unit_ws_idx" ON "om_org_units" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "om_org_unit_parent_idx" ON "om_org_units" USING btree ("parent_org_unit_id");--> statement-breakpoint
CREATE INDEX "om_org_unit_code_idx" ON "om_org_units" USING btree ("code");--> statement-breakpoint
CREATE INDEX "om_org_unit_status_idx" ON "om_org_units" USING btree ("status");--> statement-breakpoint
CREATE INDEX "om_org_unit_entity_idx" ON "om_org_units" USING btree ("legal_entity_id");--> statement-breakpoint
CREATE INDEX "om_position_ws_idx" ON "om_positions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "om_position_org_unit_idx" ON "om_positions" USING btree ("org_unit_id");--> statement-breakpoint
CREATE INDEX "om_position_job_idx" ON "om_positions" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "om_position_status_idx" ON "om_positions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "om_position_reports_idx" ON "om_positions" USING btree ("reports_to_position_id");--> statement-breakpoint
CREATE INDEX "om_reporting_ws_idx" ON "om_reporting_relationships" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "om_reporting_pos_idx" ON "om_reporting_relationships" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "om_reporting_to_idx" ON "om_reporting_relationships" USING btree ("reports_to_position_id");--> statement-breakpoint
CREATE INDEX "om_reporting_status_idx" ON "om_reporting_relationships" USING btree ("status");--> statement-breakpoint
CREATE INDEX "om_structure_version_ws_idx" ON "om_structure_versions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "om_structure_version_status_idx" ON "om_structure_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cv_audit_ws_idx" ON "cv_audit_log" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "cv_audit_entity_type_idx" ON "cv_audit_log" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "cv_audit_action_idx" ON "cv_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "cv_audit_actor_idx" ON "cv_audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "cv_behavior_ws_idx" ON "cv_behavior_models" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "cv_behavior_value_idx" ON "cv_behavior_models" USING btree ("value_definition_id");--> statement-breakpoint
CREATE INDEX "cv_nonneg_ws_idx" ON "cv_non_negotiables" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "cv_nonneg_value_idx" ON "cv_non_negotiables" USING btree ("value_definition_id");--> statement-breakpoint
CREATE INDEX "cv_ops_ws_idx" ON "cv_operationalization" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "cv_ops_value_idx" ON "cv_operationalization" USING btree ("value_definition_id");--> statement-breakpoint
CREATE INDEX "cv_ops_set_idx" ON "cv_operationalization" USING btree ("value_set_id");--> statement-breakpoint
CREATE INDEX "cv_ops_type_idx" ON "cv_operationalization" USING btree ("type");--> statement-breakpoint
CREATE INDEX "cv_value_def_ws_idx" ON "cv_value_definitions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "cv_value_def_set_idx" ON "cv_value_definitions" USING btree ("value_set_id");--> statement-breakpoint
CREATE INDEX "cv_value_set_ws_idx" ON "cv_value_sets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "cv_value_set_status_idx" ON "cv_value_sets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cv_translation_ws_idx" ON "cv_value_translations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "cv_translation_value_idx" ON "cv_value_translations" USING btree ("value_definition_id");--> statement-breakpoint
CREATE INDEX "cv_translation_unit_idx" ON "cv_value_translations" USING btree ("unit_type","unit_identifier");--> statement-breakpoint
CREATE INDEX "ps_audit_ws_idx" ON "ps_audit_log" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ps_audit_action_idx" ON "ps_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "ps_matrix_cells_version_idx" ON "ps_matrix_cells" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "ps_matrix_cells_question_idx" ON "ps_matrix_cells" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "ps_matrix_cells_scope_idx" ON "ps_matrix_cells" USING btree ("scope_id");--> statement-breakpoint
CREATE INDEX "ps_matrix_imports_ws_idx" ON "ps_matrix_imports" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ps_matrix_imports_version_idx" ON "ps_matrix_imports" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "ps_matrix_imports_status_idx" ON "ps_matrix_imports" USING btree ("import_status");--> statement-breakpoint
CREATE INDEX "ps_matrix_questions_version_idx" ON "ps_matrix_questions" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "ps_matrix_questions_sort_idx" ON "ps_matrix_questions" USING btree ("version_id","sort_order");--> statement-breakpoint
CREATE INDEX "ps_matrix_versions_ws_idx" ON "ps_matrix_versions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ps_matrix_versions_status_idx" ON "ps_matrix_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ps_resource_assignments_ws_idx" ON "ps_resource_assignments" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ps_resource_assignments_request_idx" ON "ps_resource_assignments" USING btree ("resource_request_id");--> statement-breakpoint
CREATE INDEX "ps_resource_assignments_system_idx" ON "ps_resource_assignments" USING btree ("ps_system_id");--> statement-breakpoint
CREATE INDEX "ps_resource_assignments_status_idx" ON "ps_resource_assignments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ps_resource_requests_ws_idx" ON "ps_resource_requests" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ps_resource_requests_system_idx" ON "ps_resource_requests" USING btree ("ps_system_id");--> statement-breakpoint
CREATE INDEX "ps_resource_requests_status_idx" ON "ps_resource_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ps_scope_matrix_headers_version_idx" ON "ps_scope_matrix_headers" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "ps_scope_matrix_headers_sort_idx" ON "ps_scope_matrix_headers" USING btree ("version_id","sort_order");--> statement-breakpoint
CREATE INDEX "ps_scope_matrix_profile_scope_idx" ON "ps_scope_matrix_profile" USING btree ("scope_id");--> statement-breakpoint
CREATE INDEX "ps_scope_registry_version_idx" ON "ps_scope_registry" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "ps_systems_ws_idx" ON "ps_systems" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ps_systems_status_idx" ON "ps_systems" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ps_systems_type_idx" ON "ps_systems" USING btree ("system_type");--> statement-breakpoint
CREATE INDEX "ps_wizard_runs_ws_idx" ON "ps_wizard_runs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ps_wizard_runs_type_idx" ON "ps_wizard_runs" USING btree ("selected_system_type");