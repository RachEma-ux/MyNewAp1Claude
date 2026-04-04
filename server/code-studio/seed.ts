/**
 * CODEDB Seed — Creates tables and seeds initial data
 *
 * Uses raw SQL for table creation (same pattern as PRMDB/PSMDB).
 * Idempotent — safe to run on every startup.
 */

import { getCodeDb } from "./connection";
import { sql } from "drizzle-orm";

export async function seedCodeDb() {
  const db = getCodeDb();
  if (!db) {
    console.warn("[CODEDB Seed] Database unavailable, skipping");
    return;
  }

  // ── Create tables ──────────────────────────────────────────────────────────

  await db.execute(sql`
    -- Group 1: Repository Registry
    CREATE TABLE IF NOT EXISTS code_repositories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      default_branch TEXT DEFAULT 'main',
      protected_branches JSONB DEFAULT '[]',
      clone_method VARCHAR(20) DEFAULT 'https',
      is_active BOOLEAN DEFAULT true,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_repos_name ON code_repositories(name);

    CREATE TABLE IF NOT EXISTS code_repo_policies (
      id SERIAL PRIMARY KEY,
      repo_id INTEGER NOT NULL,
      policy_type VARCHAR(50) NOT NULL,
      rule JSONB NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_repo_policies_repo ON code_repo_policies(repo_id);

    -- Group 2: Workspace Management
    CREATE TABLE IF NOT EXISTS code_workspaces (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL,
      repo_id INTEGER NOT NULL,
      workspace_path TEXT NOT NULL,
      branch_name TEXT NOT NULL,
      baseline_sha VARCHAR(40),
      final_sha VARCHAR(40),
      status VARCHAR(30) DEFAULT 'active' NOT NULL,
      changed_files JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW(),
      cleaned_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_code_workspaces_job ON code_workspaces(job_id);
    CREATE INDEX IF NOT EXISTS idx_code_workspaces_repo ON code_workspaces(repo_id);

    CREATE TABLE IF NOT EXISTS code_workspace_locks (
      id SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      locked_by VARCHAR(100) NOT NULL,
      locked_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP,
      reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_code_ws_locks_ws ON code_workspace_locks(workspace_id);

    -- Group 3: Coding Job Lifecycle
    CREATE TABLE IF NOT EXISTS code_jobs (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      objective TEXT,
      constraints JSONB DEFAULT '{}',
      status VARCHAR(30) DEFAULT 'draft' NOT NULL,
      priority VARCHAR(20) DEFAULT 'normal',
      repo_id INTEGER,
      source_module VARCHAR(50),
      source_workflow_id VARCHAR(100),
      actor_user_id INTEGER,
      provider_name VARCHAR(60),
      model_id VARCHAR(120),
      result_summary JSONB,
      error_message TEXT,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_jobs_status ON code_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_code_jobs_actor ON code_jobs(actor_user_id);
    CREATE INDEX IF NOT EXISTS idx_code_jobs_repo ON code_jobs(repo_id);
    ALTER TABLE code_jobs ADD COLUMN IF NOT EXISTS provider_name VARCHAR(60);
    ALTER TABLE code_jobs ADD COLUMN IF NOT EXISTS model_id VARCHAR(120);

    CREATE TABLE IF NOT EXISTS code_job_steps (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL,
      step_name VARCHAR(50) NOT NULL,
      step_order INTEGER NOT NULL,
      status VARCHAR(30) DEFAULT 'pending' NOT NULL,
      agent_role VARCHAR(50),
      session_id VARCHAR(100),
      input JSONB,
      output JSONB,
      error_message TEXT,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_job_steps_job ON code_job_steps(job_id);

    CREATE TABLE IF NOT EXISTS code_handoffs (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL,
      direction VARCHAR(10) NOT NULL,
      source_module VARCHAR(50),
      payload JSONB NOT NULL,
      callback_url TEXT,
      callback_status VARCHAR(30),
      callback_payload JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      processed_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_code_handoffs_job ON code_handoffs(job_id);
    CREATE INDEX IF NOT EXISTS idx_code_handoffs_dir ON code_handoffs(direction);

    -- Group 4: OpenCode Runtime Tracking
    CREATE TABLE IF NOT EXISTS code_sessions (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL,
      opencode_session_id VARCHAR(200),
      agent_role VARCHAR(50),
      status VARCHAR(30) DEFAULT 'active' NOT NULL,
      model VARCHAR(100),
      tokens_in INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      closed_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_code_sessions_job ON code_sessions(job_id);
    CREATE INDEX IF NOT EXISTS idx_code_sessions_oc ON code_sessions(opencode_session_id);

    CREATE TABLE IF NOT EXISTS code_session_messages (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL,
      opencode_message_id VARCHAR(200),
      role VARCHAR(20) NOT NULL,
      content_preview TEXT,
      tool_calls JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_sess_msgs_sess ON code_session_messages(session_id);

    CREATE TABLE IF NOT EXISTS code_session_children (
      id SERIAL PRIMARY KEY,
      parent_session_id INTEGER NOT NULL,
      child_session_id INTEGER NOT NULL,
      agent_role VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_sess_children_parent ON code_session_children(parent_session_id);

    CREATE TABLE IF NOT EXISTS code_run_events (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL,
      session_id INTEGER,
      event_type VARCHAR(50) NOT NULL,
      event_data JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_run_events_job ON code_run_events(job_id);
    CREATE INDEX IF NOT EXISTS idx_code_run_events_type ON code_run_events(event_type);

    -- Group 5: Approvals / Permissions
    CREATE TABLE IF NOT EXISTS code_permission_requests (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL,
      session_id INTEGER,
      opencode_permission_id VARCHAR(200),
      permission_type VARCHAR(50) NOT NULL,
      tool_name VARCHAR(50),
      description TEXT,
      risk_level VARCHAR(20) DEFAULT 'medium',
      request_payload JSONB,
      status VARCHAR(20) DEFAULT 'pending' NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      resolved_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_code_perm_reqs_job ON code_permission_requests(job_id);
    CREATE INDEX IF NOT EXISTS idx_code_perm_reqs_status ON code_permission_requests(status);

    CREATE TABLE IF NOT EXISTS code_approvals (
      id SERIAL PRIMARY KEY,
      permission_request_id INTEGER NOT NULL,
      decision VARCHAR(20) NOT NULL,
      scope VARCHAR(30) DEFAULT 'once',
      actor_user_id INTEGER,
      rationale TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_approvals_req ON code_approvals(permission_request_id);
    CREATE INDEX IF NOT EXISTS idx_code_approvals_actor ON code_approvals(actor_user_id);

    CREATE TABLE IF NOT EXISTS code_policy_profiles (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      repo_id INTEGER,
      rules JSONB NOT NULL,
      is_default BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_policy_profiles_name ON code_policy_profiles(name);

    -- Group 6: Artifacts / Outputs
    CREATE TABLE IF NOT EXISTS code_diffs (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL,
      session_id INTEGER,
      file_path TEXT NOT NULL,
      diff_type VARCHAR(20) NOT NULL,
      diff_content TEXT,
      lines_added INTEGER DEFAULT 0,
      lines_removed INTEGER DEFAULT 0,
      status VARCHAR(20) DEFAULT 'proposed',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_diffs_job ON code_diffs(job_id);

    CREATE TABLE IF NOT EXISTS code_artifacts (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL,
      artifact_type VARCHAR(50) NOT NULL,
      name TEXT NOT NULL,
      content TEXT,
      content_ref TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_artifacts_job ON code_artifacts(job_id);
    CREATE INDEX IF NOT EXISTS idx_code_artifacts_type ON code_artifacts(artifact_type);

    CREATE TABLE IF NOT EXISTS code_pull_request_candidates (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL,
      repo_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      source_branch TEXT NOT NULL,
      target_branch TEXT NOT NULL,
      status VARCHAR(20) DEFAULT 'draft',
      external_pr_url TEXT,
      diff_summary JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_pr_candidates_job ON code_pull_request_candidates(job_id);

    -- Group 7: Audit / Operations
    CREATE TABLE IF NOT EXISTS code_audit_events (
      id SERIAL PRIMARY KEY,
      event_type VARCHAR(50) NOT NULL,
      entity_type VARCHAR(30),
      entity_id INTEGER,
      actor_user_id INTEGER,
      details JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_audit_events_type ON code_audit_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_code_audit_events_entity ON code_audit_events(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_code_audit_events_created ON code_audit_events(created_at);

    CREATE TABLE IF NOT EXISTS code_health_snapshots (
      id SERIAL PRIMARY KEY,
      opencode_healthy BOOLEAN,
      codedb_healthy BOOLEAN,
      active_jobs INTEGER DEFAULT 0,
      active_sessions INTEGER DEFAULT 0,
      pending_approvals INTEGER DEFAULT 0,
      workspace_count INTEGER DEFAULT 0,
      details JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS code_retention_batches (
      id SERIAL PRIMARY KEY,
      batch_type VARCHAR(30) NOT NULL,
      items_processed INTEGER DEFAULT 0,
      items_failed INTEGER DEFAULT 0,
      details JSONB DEFAULT '{}',
      started_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    );

    -- Group 8: Settings
    CREATE TABLE IF NOT EXISTS code_settings (
      id SERIAL PRIMARY KEY,
      key VARCHAR(100) NOT NULL UNIQUE,
      value JSONB DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_settings_key ON code_settings(key);

    -- Group 9: AI Catalog Imports
    CREATE TABLE IF NOT EXISTS code_catalog_imports (
      id SERIAL PRIMARY KEY,
      catalog_entry_id INTEGER NOT NULL,
      entry_type VARCHAR(20) NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT DEFAULT '',
      category VARCHAR(50) DEFAULT '',
      tags JSON DEFAULT '[]',
      config JSON DEFAULT '{}',
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_code_catalog_imports_entry ON code_catalog_imports(catalog_entry_id);

    -- Group 10: OpenCode Settings Profiles
    CREATE TABLE IF NOT EXISTS code_opencode_profiles (
      id SERIAL PRIMARY KEY,
      profile_type VARCHAR(20) NOT NULL,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      config_draft JSONB DEFAULT '{}',
      config_applied JSONB,
      status VARCHAR(20) DEFAULT 'draft' NOT NULL,
      is_active BOOLEAN DEFAULT true,
      applied_at TIMESTAMP,
      applied_version INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_oc_profiles_type ON code_opencode_profiles(profile_type);
    CREATE INDEX IF NOT EXISTS idx_code_oc_profiles_active ON code_opencode_profiles(is_active);

    CREATE TABLE IF NOT EXISTS code_opencode_profile_versions (
      id SERIAL PRIMARY KEY,
      profile_id INTEGER NOT NULL,
      version INTEGER NOT NULL,
      config JSONB NOT NULL,
      change_summary TEXT,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_oc_pv_profile ON code_opencode_profile_versions(profile_id);
    CREATE INDEX IF NOT EXISTS idx_code_oc_pv_version ON code_opencode_profile_versions(profile_id, version);

    CREATE TABLE IF NOT EXISTS code_opencode_apply_events (
      id SERIAL PRIMARY KEY,
      profile_id INTEGER NOT NULL,
      profile_type VARCHAR(20) NOT NULL,
      version INTEGER NOT NULL,
      action VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL,
      generated_config JSONB,
      validation_errors JSONB,
      health_check_result JSONB,
      error_message TEXT,
      actor_user_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_oc_apply_profile ON code_opencode_apply_events(profile_id);
    CREATE INDEX IF NOT EXISTS idx_code_oc_apply_type ON code_opencode_apply_events(profile_type);
    CREATE INDEX IF NOT EXISTS idx_code_oc_apply_created ON code_opencode_apply_events(created_at);

    -- Group 11: Job Templates
    CREATE TABLE IF NOT EXISTS code_job_templates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      category VARCHAR(50) DEFAULT 'general',
      template_yaml TEXT NOT NULL,
      is_builtin BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_code_job_templates_name ON code_job_templates(name);
    CREATE INDEX IF NOT EXISTS idx_code_job_templates_category ON code_job_templates(category);

    -- Group 12: IDE Instances (OpenCode Web)
    CREATE TABLE IF NOT EXISTS code_ide_instances (
      id SERIAL PRIMARY KEY,
      job_id INTEGER,
      session_id INTEGER,
      workspace_id INTEGER,
      workspace_path TEXT NOT NULL,
      instance_type VARCHAR(30) DEFAULT 'opencode_web' NOT NULL,
      status VARCHAR(30) DEFAULT 'starting' NOT NULL,
      hostname VARCHAR(100) DEFAULT '127.0.0.1',
      port INTEGER NOT NULL,
      proxy_key VARCHAR(100) NOT NULL,
      process_id INTEGER,
      launch_command TEXT,
      started_at TIMESTAMP DEFAULT NOW(),
      last_accessed_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP,
      closed_at TIMESTAMP,
      error_message TEXT,
      metadata JSONB DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_code_ide_instances_job ON code_ide_instances(job_id);
    CREATE INDEX IF NOT EXISTS idx_code_ide_instances_session ON code_ide_instances(session_id);
    CREATE INDEX IF NOT EXISTS idx_code_ide_instances_proxy_key ON code_ide_instances(proxy_key);
    CREATE INDEX IF NOT EXISTS idx_code_ide_instances_status ON code_ide_instances(status);
  `);

  console.log("[CODEDB Seed] Tables created/verified");

  // ── Seed default policy profile ────────────────────────────────────────────

  const existing = await db.execute(
    sql`SELECT id FROM code_policy_profiles WHERE is_default = true LIMIT 1`
  );
  if ((existing as any).rows?.length === 0 || (existing as any).length === 0) {
    await db.execute(sql`
      INSERT INTO code_policy_profiles (name, rules, is_default, is_active)
      VALUES (
        'Default Security Policy',
        '{"denyDestructiveCommands": true, "denyExternalDirectories": true, "denySecretFiles": true, "requireApprovalForEdits": false, "requireApprovalForBash": true}'::jsonb,
        true,
        true
      )
    `);
    console.log("[CODEDB Seed] Default policy profile created");
  }

  console.log("[CODEDB Seed] Complete");
}
