/**
 * PRM Seed — PRMDB bootstrap: create tables, seed method templates & playbooks
 *
 * This runs independently of main DB migrations.
 * Call from server startup or manually.
 */

import { sql } from "drizzle-orm";
import { getPrmDb } from "./connection";
import { METHOD_CATALOG } from "./prm.methods";
import * as schema from "../../drizzle/tables/prmdb";

export async function seedPrmDb() {
  const db = getPrmDb();
  if (!db) {
    console.log("[PRMDB Seed] Cannot seed — PRMDB not connected");
    return;
  }

  try {
    // Create all tables if they don't exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS prm_cases (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        severity VARCHAR(30),
        priority VARCHAR(30),
        status VARCHAR(30) NOT NULL DEFAULT 'draft',
        source_type VARCHAR(50),
        owner_user_id INTEGER,
        reporter_user_id INTEGER,
        confidence NUMERIC(5,2),
        impact_statement TEXT,
        scope TEXT,
        closure_reason TEXT,
        reopen_reason TEXT,
        ext_project_id INTEGER,
        ext_pm_work_id INTEGER,
        ext_workspace_id INTEGER,
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL,
        closed_at TIMESTAMP,
        reopened_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS prm_cases_status_idx ON prm_cases(status);
      CREATE INDEX IF NOT EXISTS prm_cases_severity_idx ON prm_cases(severity);
      CREATE INDEX IF NOT EXISTS prm_cases_owner_idx ON prm_cases(owner_user_id);

      CREATE TABLE IF NOT EXISTS prm_case_events (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        from_status VARCHAR(30),
        to_status VARCHAR(30),
        actor_user_id INTEGER,
        reason TEXT,
        metadata JSON,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS prm_case_events_case_idx ON prm_case_events(case_id);

      CREATE TABLE IF NOT EXISTS prm_method_templates (
        id SERIAL PRIMARY KEY,
        method_type VARCHAR(50) NOT NULL,
        name VARCHAR(255),
        description TEXT,
        template_data JSON,
        category VARCHAR(50),
        is_system BOOLEAN DEFAULT true,
        published BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS prm_method_templates_type_idx ON prm_method_templates(method_type);

      CREATE TABLE IF NOT EXISTS prm_method_runs (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL,
        template_id INTEGER,
        method_type VARCHAR(50) NOT NULL,
        workspace_data JSON,
        narrative_summary TEXT,
        status VARCHAR(30) DEFAULT 'in_progress',
        started_by INTEGER,
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL,
        completed_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS prm_method_runs_case_idx ON prm_method_runs(case_id);
      CREATE INDEX IF NOT EXISTS prm_method_runs_type_idx ON prm_method_runs(method_type);

      CREATE TABLE IF NOT EXISTS prm_decisions (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        chosen_path TEXT,
        rationale TEXT NOT NULL,
        alternatives JSON,
        constraints JSON,
        approved_by INTEGER,
        approved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS prm_decisions_case_idx ON prm_decisions(case_id);

      CREATE TABLE IF NOT EXISTS prm_actions (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL,
        action_type VARCHAR(30) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        owner_user_id INTEGER,
        due_date TIMESTAMP,
        status VARCHAR(30) DEFAULT 'pending',
        dependency_note TEXT,
        effectiveness_result TEXT,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS prm_actions_case_idx ON prm_actions(case_id);
      CREATE INDEX IF NOT EXISTS prm_actions_status_idx ON prm_actions(status);

      CREATE TABLE IF NOT EXISTS prm_evidence (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL,
        evidence_type VARCHAR(30),
        title VARCHAR(255),
        file_url TEXT,
        external_url TEXT,
        notes TEXT,
        is_validated BOOLEAN DEFAULT false,
        validated_by INTEGER,
        validated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS prm_evidence_case_idx ON prm_evidence(case_id);

      CREATE TABLE IF NOT EXISTS prm_verifications (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL,
        test_condition TEXT NOT NULL,
        expected_result TEXT NOT NULL,
        actual_result TEXT,
        passed BOOLEAN,
        approver_user_id INTEGER,
        signed_off_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS prm_verifications_case_idx ON prm_verifications(case_id);

      CREATE TABLE IF NOT EXISTS prm_prevention_plans (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL,
        control_change TEXT,
        sop_update TEXT,
        training_need TEXT,
        monitoring_rule TEXT,
        status VARCHAR(30) DEFAULT 'draft',
        owner_user_id INTEGER,
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS prm_prevention_plans_case_idx ON prm_prevention_plans(case_id);

      CREATE TABLE IF NOT EXISTS prm_lessons (
        id SERIAL PRIMARY KEY,
        case_id INTEGER,
        title VARCHAR(255) NOT NULL,
        what_happened TEXT,
        why_it_mattered TEXT,
        what_changed TEXT,
        reuse_notes TEXT,
        published BOOLEAN DEFAULT false,
        published_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS prm_lessons_case_idx ON prm_lessons(case_id);

      CREATE TABLE IF NOT EXISTS prm_playbooks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        domain VARCHAR(50),
        method_type VARCHAR(50),
        template_data JSON,
        source_lesson_id INTEGER,
        published BOOLEAN DEFAULT false,
        published_at TIMESTAMP,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS prm_playbooks_domain_idx ON prm_playbooks(domain);

      CREATE TABLE IF NOT EXISTS prm_catalog_items (
        id SERIAL PRIMARY KEY,
        item_type VARCHAR(30),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        content_data JSON,
        source_id INTEGER,
        source_type VARCHAR(30),
        publication_state VARCHAR(30) DEFAULT 'draft',
        reviewed_by INTEGER,
        published_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS prm_catalog_items_type_idx ON prm_catalog_items(item_type);
      CREATE INDEX IF NOT EXISTS prm_catalog_items_state_idx ON prm_catalog_items(publication_state);

      CREATE TABLE IF NOT EXISTS prm_training_assets (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        module_number INTEGER,
        content_data JSON,
        asset_type VARCHAR(30),
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS prm_maturity_runs (
        id SERIAL PRIMARY KEY,
        run_date TIMESTAMP DEFAULT now() NOT NULL,
        assessor_user_id INTEGER,
        dimension_scores JSON,
        total_score INTEGER,
        maturity_level INTEGER,
        gap_notes TEXT,
        next_actions TEXT,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS prm_kpi_snapshots (
        id SERIAL PRIMARY KEY,
        snapshot_date TIMESTAMP DEFAULT now() NOT NULL,
        open_cases INTEGER,
        overdue_actions INTEGER,
        mean_time_to_resolution NUMERIC,
        recurrence_rate NUMERIC,
        verification_rate NUMERIC,
        method_usage JSON,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS prm_reporting_jobs (
        id SERIAL PRIMARY KEY,
        job_type VARCHAR(50),
        parameters JSON,
        result_data JSON,
        status VARCHAR(30) DEFAULT 'pending',
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS prm_reporting_jobs_status_idx ON prm_reporting_jobs(status);

      CREATE TABLE IF NOT EXISTS prm_external_refs (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL,
        target_module VARCHAR(30) NOT NULL,
        target_id INTEGER NOT NULL,
        ref_type VARCHAR(30),
        label VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS prm_external_refs_case_idx ON prm_external_refs(case_id);
      CREATE INDEX IF NOT EXISTS prm_external_refs_target_idx ON prm_external_refs(target_module, target_id);

      CREATE TABLE IF NOT EXISTS prm_sync_events (
        id SERIAL PRIMARY KEY,
        case_id INTEGER,
        direction VARCHAR(10),
        target_module VARCHAR(30),
        event_type VARCHAR(50),
        payload JSON,
        status VARCHAR(30) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS prm_sync_events_case_idx ON prm_sync_events(case_id);

      CREATE TABLE IF NOT EXISTS prm_publication_states (
        id SERIAL PRIMARY KEY,
        entity_type VARCHAR(30),
        entity_id INTEGER,
        state VARCHAR(30),
        reviewer_user_id INTEGER,
        review_notes TEXT,
        state_changed_at TIMESTAMP DEFAULT now() NOT NULL,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS prm_pub_states_entity_idx ON prm_publication_states(entity_type, entity_id);
    `);

    console.log("[PRMDB Seed] Tables created/verified");

    // Seed method templates if table is empty
    const existing = await db.select().from(schema.prmMethodTemplates).limit(1);
    if (existing.length === 0) {
      for (const method of METHOD_CATALOG) {
        await db.insert(schema.prmMethodTemplates).values({
          methodType: method.methodType,
          name: method.name,
          description: method.description,
          templateData: method.defaultTemplate,
          category: method.category,
          isSystem: true,
          published: true,
        });
      }
      console.log(`[PRMDB Seed] Seeded ${METHOD_CATALOG.length} method templates`);
    }

    console.log("[PRMDB Seed] Complete");
  } catch (error) {
    console.error("[PRMDB Seed] Error:", error);
  }
}
