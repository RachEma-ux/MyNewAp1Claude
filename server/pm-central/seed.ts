/**
 * PMDB — Seed Script
 *
 * Creates PM Central tables idempotently using CREATE TABLE IF NOT
 * EXISTS. Called from the manifest boot hook on server startup.
 * Wrapped in try/catch by the caller so a missing DB does not block
 * the platform.
 */

import { sql } from "drizzle-orm";
import { getPmDb } from "./connection";

export interface SeedResult {
  seeded: boolean;
  reason?: string;
}

export async function seedPmDb(): Promise<SeedResult> {
  const db = getPmDb();
  if (!db) {
    return { seeded: false, reason: "PMDB not connected" };
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pm_projects (
      id SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      source_module VARCHAR(50),
      source_ref_id INTEGER,
      source_handoff_id INTEGER,
      name VARCHAR(500) NOT NULL,
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      priority VARCHAR(10) NOT NULL DEFAULT 'normal',
      owner_user_id INTEGER,
      metadata_json JSONB,
      created_by INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT now() NOT NULL,
      updated_at TIMESTAMP DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pm_projects_workspace_idx ON pm_projects(workspace_id);
    CREATE INDEX IF NOT EXISTS pm_projects_status_idx ON pm_projects(status);
    CREATE INDEX IF NOT EXISTS pm_projects_source_idx ON pm_projects(source_module, source_ref_id);
    CREATE INDEX IF NOT EXISTS pm_projects_owner_idx ON pm_projects(owner_user_id);

    CREATE TABLE IF NOT EXISTS pm_plans (
      id SERIAL PRIMARY KEY,
      pm_project_id INTEGER NOT NULL,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      plan_status VARCHAR(20) NOT NULL DEFAULT 'draft',
      metadata_json JSONB,
      created_by INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT now() NOT NULL,
      updated_at TIMESTAMP DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pm_plans_project_idx ON pm_plans(pm_project_id);
    CREATE INDEX IF NOT EXISTS pm_plans_status_idx ON pm_plans(plan_status);

    CREATE TABLE IF NOT EXISTS pm_milestones (
      id SERIAL PRIMARY KEY,
      pm_project_id INTEGER NOT NULL,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      due_date TIMESTAMP,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT now() NOT NULL,
      updated_at TIMESTAMP DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pm_milestones_project_idx ON pm_milestones(pm_project_id);
    CREATE INDEX IF NOT EXISTS pm_milestones_status_idx ON pm_milestones(status);
    CREATE INDEX IF NOT EXISTS pm_milestones_due_idx ON pm_milestones(due_date);

    CREATE TABLE IF NOT EXISTS pm_tasks (
      id SERIAL PRIMARY KEY,
      pm_project_id INTEGER NOT NULL,
      milestone_id INTEGER,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      assignee_user_id INTEGER,
      status VARCHAR(20) NOT NULL DEFAULT 'todo',
      priority VARCHAR(10) NOT NULL DEFAULT 'normal',
      due_date TIMESTAMP,
      metadata_json JSONB,
      created_by INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT now() NOT NULL,
      updated_at TIMESTAMP DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pm_tasks_project_idx ON pm_tasks(pm_project_id);
    CREATE INDEX IF NOT EXISTS pm_tasks_milestone_idx ON pm_tasks(milestone_id);
    CREATE INDEX IF NOT EXISTS pm_tasks_assignee_idx ON pm_tasks(assignee_user_id);
    CREATE INDEX IF NOT EXISTS pm_tasks_status_idx ON pm_tasks(status);

    CREATE TABLE IF NOT EXISTS pm_risks (
      id SERIAL PRIMARY KEY,
      pm_project_id INTEGER NOT NULL,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      severity VARCHAR(10) NOT NULL DEFAULT 'medium',
      probability VARCHAR(10) NOT NULL DEFAULT 'medium',
      mitigation TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      created_by INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT now() NOT NULL,
      updated_at TIMESTAMP DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pm_risks_project_idx ON pm_risks(pm_project_id);
    CREATE INDEX IF NOT EXISTS pm_risks_status_idx ON pm_risks(status);
    CREATE INDEX IF NOT EXISTS pm_risks_severity_idx ON pm_risks(severity);

    CREATE TABLE IF NOT EXISTS pm_issues (
      id SERIAL PRIMARY KEY,
      pm_project_id INTEGER NOT NULL,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      severity VARCHAR(10) NOT NULL DEFAULT 'medium',
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      owner_user_id INTEGER,
      created_by INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT now() NOT NULL,
      updated_at TIMESTAMP DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pm_issues_project_idx ON pm_issues(pm_project_id);
    CREATE INDEX IF NOT EXISTS pm_issues_status_idx ON pm_issues(status);
    CREATE INDEX IF NOT EXISTS pm_issues_owner_idx ON pm_issues(owner_user_id);

    CREATE TABLE IF NOT EXISTS pm_decisions (
      id SERIAL PRIMARY KEY,
      pm_project_id INTEGER NOT NULL,
      title VARCHAR(500) NOT NULL,
      decision TEXT NOT NULL,
      rationale TEXT,
      decided_by INTEGER NOT NULL,
      decided_at TIMESTAMP DEFAULT now() NOT NULL,
      created_at TIMESTAMP DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pm_decisions_project_idx ON pm_decisions(pm_project_id);
    CREATE INDEX IF NOT EXISTS pm_decisions_decided_idx ON pm_decisions(decided_at);

    CREATE TABLE IF NOT EXISTS pm_handoffs (
      id SERIAL PRIMARY KEY,
      handoff_id VARCHAR(100),
      source_module VARCHAR(50) NOT NULL,
      source_ref_id INTEGER,
      target_pm_project_id INTEGER,
      status VARCHAR(20) NOT NULL DEFAULT 'received',
      payload_json JSONB,
      created_at TIMESTAMP DEFAULT now() NOT NULL,
      updated_at TIMESTAMP DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pm_handoffs_source_idx ON pm_handoffs(source_module, source_ref_id);
    CREATE INDEX IF NOT EXISTS pm_handoffs_status_idx ON pm_handoffs(status);
    CREATE INDEX IF NOT EXISTS pm_handoffs_target_idx ON pm_handoffs(target_pm_project_id);

    CREATE TABLE IF NOT EXISTS pm_activity_log (
      id SERIAL PRIMARY KEY,
      pm_project_id INTEGER,
      actor_user_id INTEGER,
      event_type VARCHAR(100) NOT NULL,
      message VARCHAR(1000),
      metadata_json JSONB,
      created_at TIMESTAMP DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pm_activity_project_idx ON pm_activity_log(pm_project_id);
    CREATE INDEX IF NOT EXISTS pm_activity_event_idx ON pm_activity_log(event_type);
    CREATE INDEX IF NOT EXISTS pm_activity_created_idx ON pm_activity_log(created_at);
  `);

  return { seeded: true };
}
