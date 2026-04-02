/**
 * PSM Seed — PSMDB bootstrap: create tables, seed categories, methods, and fit rules
 *
 * Runs independently of main DB migrations.
 * Call from server startup or manually. Idempotent.
 */

import { sql } from "drizzle-orm";
import { getPsmDb } from "./connection";
import { PSM_CATEGORIES, PSM_METHOD_CATALOG, PSM_PROBLEM_TYPES } from "./psm.methods";
import * as schema from "../../drizzle/tables/psmdb";

export async function seedPsmDb() {
  const db = getPsmDb();
  if (!db) {
    console.log("[PSMDB Seed] Cannot seed — PSMDB not connected");
    return;
  }

  try {
    // ── Create all tables ─────────────────────────────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS psm_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) NOT NULL,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_categories_slug ON psm_categories(slug);

      CREATE TABLE IF NOT EXISTS psm_methods (
        id SERIAL PRIMARY KEY,
        category_id INTEGER,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        description TEXT,
        summary TEXT,
        complexity VARCHAR(20) DEFAULT 'medium',
        timeframe VARCHAR(20) DEFAULT 'medium',
        participants_min INTEGER DEFAULT 1,
        participants_max INTEGER DEFAULT 10,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        version INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_methods_slug ON psm_methods(slug);
      CREATE INDEX IF NOT EXISTS idx_psm_methods_category ON psm_methods(category_id);
      CREATE INDEX IF NOT EXISTS idx_psm_methods_status ON psm_methods(status);

      CREATE TABLE IF NOT EXISTS psm_method_aliases (
        id SERIAL PRIMARY KEY,
        method_id INTEGER NOT NULL,
        alias VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_method_aliases_method ON psm_method_aliases(method_id);

      CREATE TABLE IF NOT EXISTS psm_method_relations (
        id SERIAL PRIMARY KEY,
        method_id INTEGER NOT NULL,
        related_method_id INTEGER NOT NULL,
        relation_type VARCHAR(30) NOT NULL,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_method_relations_method ON psm_method_relations(method_id);

      CREATE TABLE IF NOT EXISTS psm_method_tags (
        id SERIAL PRIMARY KEY,
        method_id INTEGER NOT NULL,
        tag VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_method_tags_method ON psm_method_tags(method_id);
      CREATE INDEX IF NOT EXISTS idx_psm_method_tags_tag ON psm_method_tags(tag);

      CREATE TABLE IF NOT EXISTS psm_method_definitions (
        id SERIAL PRIMARY KEY,
        method_id INTEGER NOT NULL,
        version INTEGER DEFAULT 1,
        definition TEXT,
        best_for TEXT,
        tools TEXT,
        example TEXT,
        source_reference TEXT,
        content_status VARCHAR(20) DEFAULT 'published',
        published_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_method_defs_method ON psm_method_definitions(method_id);

      CREATE TABLE IF NOT EXISTS psm_method_workflows (
        id SERIAL PRIMARY KEY,
        method_id INTEGER NOT NULL,
        version INTEGER DEFAULT 1,
        title VARCHAR(255),
        description TEXT,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_method_workflows_method ON psm_method_workflows(method_id);

      CREATE TABLE IF NOT EXISTS psm_method_workflow_steps (
        id SERIAL PRIMARY KEY,
        workflow_id INTEGER NOT NULL,
        step_number INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        duration_minutes INTEGER DEFAULT 30,
        deliverable TEXT,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_wf_steps_workflow ON psm_method_workflow_steps(workflow_id);

      CREATE TABLE IF NOT EXISTS psm_problem_types (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_problem_types_slug ON psm_problem_types(slug);

      CREATE TABLE IF NOT EXISTS psm_method_fit_rules (
        id SERIAL PRIMARY KEY,
        method_id INTEGER NOT NULL,
        problem_type_id INTEGER,
        dimension VARCHAR(50) NOT NULL,
        weight NUMERIC(5,2) DEFAULT 1.00,
        min_score NUMERIC(5,2),
        max_score NUMERIC(5,2),
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_fit_rules_method ON psm_method_fit_rules(method_id);

      CREATE TABLE IF NOT EXISTS psm_selector_profiles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        dimensions JSON,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS psm_cases (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        problem_type_id INTEGER,
        status VARCHAR(30) NOT NULL DEFAULT 'draft',
        owner_user_id INTEGER,
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL,
        completed_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_psm_cases_status ON psm_cases(status);
      CREATE INDEX IF NOT EXISTS idx_psm_cases_owner ON psm_cases(owner_user_id);

      CREATE TABLE IF NOT EXISTS psm_case_inputs (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL,
        dimension VARCHAR(50) NOT NULL,
        score NUMERIC(5,2),
        notes TEXT,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_case_inputs_case ON psm_case_inputs(case_id);

      CREATE TABLE IF NOT EXISTS psm_case_recommendations (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL,
        method_id INTEGER NOT NULL,
        score NUMERIC(7,2),
        rank INTEGER,
        explanation TEXT,
        ai_contributed BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_case_recs_case ON psm_case_recommendations(case_id);

      CREATE TABLE IF NOT EXISTS psm_case_selected_methods (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL,
        method_id INTEGER NOT NULL,
        reason TEXT,
        selected_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_case_sel_methods_case ON psm_case_selected_methods(case_id);

      CREATE TABLE IF NOT EXISTS psm_case_runs (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL,
        method_id INTEGER NOT NULL,
        workflow_id INTEGER,
        status VARCHAR(30) NOT NULL DEFAULT 'draft',
        current_step INTEGER DEFAULT 1,
        summary TEXT,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_case_runs_case ON psm_case_runs(case_id);
      CREATE INDEX IF NOT EXISTS idx_psm_case_runs_status ON psm_case_runs(status);

      CREATE TABLE IF NOT EXISTS psm_case_step_runs (
        id SERIAL PRIMARY KEY,
        run_id INTEGER NOT NULL,
        step_number INTEGER NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        notes TEXT,
        output JSON,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_case_step_runs_run ON psm_case_step_runs(run_id);

      CREATE TABLE IF NOT EXISTS psm_case_notes (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL,
        run_id INTEGER,
        author_user_id INTEGER,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_case_notes_case ON psm_case_notes(case_id);

      CREATE TABLE IF NOT EXISTS psm_case_decision_log (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        decision TEXT,
        rationale TEXT,
        alternatives JSON,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_case_decision_log_case ON psm_case_decision_log(case_id);

      CREATE TABLE IF NOT EXISTS psm_content_packs (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        version INTEGER DEFAULT 1,
        description TEXT,
        status VARCHAR(30) NOT NULL DEFAULT 'draft',
        item_count INTEGER DEFAULT 0,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        published_at TIMESTAMP,
        rolled_back_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_psm_content_packs_status ON psm_content_packs(status);

      CREATE TABLE IF NOT EXISTS psm_content_pack_items (
        id SERIAL PRIMARY KEY,
        pack_id INTEGER NOT NULL,
        method_id INTEGER,
        action VARCHAR(20) NOT NULL DEFAULT 'add',
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_content_pack_items_pack ON psm_content_pack_items(pack_id);

      CREATE TABLE IF NOT EXISTS psm_import_runs (
        id SERIAL PRIMARY KEY,
        pack_id INTEGER,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        issue_count INTEGER DEFAULT 0,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_import_runs_pack ON psm_import_runs(pack_id);

      CREATE TABLE IF NOT EXISTS psm_import_issues (
        id SERIAL PRIMARY KEY,
        import_run_id INTEGER NOT NULL,
        severity VARCHAR(20) NOT NULL DEFAULT 'info',
        field VARCHAR(100),
        message TEXT,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_import_issues_import ON psm_import_issues(import_run_id);

      CREATE TABLE IF NOT EXISTS psm_publish_log (
        id SERIAL PRIMARY KEY,
        pack_id INTEGER NOT NULL,
        action VARCHAR(20) NOT NULL,
        actor_user_id INTEGER,
        reason TEXT,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_publish_log_pack ON psm_publish_log(pack_id);

      CREATE TABLE IF NOT EXISTS psm_audit_events (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(50) NOT NULL,
        entity_type VARCHAR(50),
        entity_id INTEGER,
        actor_user_id INTEGER,
        metadata JSON,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_psm_audit_events_type ON psm_audit_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_psm_audit_events_entity ON psm_audit_events(entity_type, entity_id);

      CREATE TABLE IF NOT EXISTS psm_health_snapshots (
        id SERIAL PRIMARY KEY,
        method_count INTEGER DEFAULT 0,
        case_count INTEGER DEFAULT 0,
        active_run_count INTEGER DEFAULT 0,
        last_import_at TIMESTAMP,
        snapshot_at TIMESTAMP DEFAULT now() NOT NULL,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      );
    `);

    console.log("[PSMDB Seed] Tables created/verified");

    // ── Check if already seeded ─────────────────────────────────────────
    const existing = await db.select().from(schema.psmMethods).limit(1);
    if (existing.length > 0) {
      console.log("[PSMDB Seed] Already populated — skipping data seed");
      return;
    }

    // ── Seed Categories ─────────────────────────────────────────────────
    const categoryIdMap = new Map<string, number>();
    for (const cat of PSM_CATEGORIES) {
      const [inserted] = await db.insert(schema.psmCategories).values({
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        sortOrder: cat.sortOrder,
      }).returning();
      categoryIdMap.set(cat.slug, inserted.id);
    }
    console.log(`[PSMDB Seed] Seeded ${categoryIdMap.size} categories`);

    // ── Seed Problem Types ──────────────────────────────────────────────
    for (const pt of PSM_PROBLEM_TYPES) {
      await db.insert(schema.psmProblemTypes).values({
        name: pt.name,
        slug: pt.slug,
        description: pt.description,
      });
    }
    console.log(`[PSMDB Seed] Seeded ${PSM_PROBLEM_TYPES.length} problem types`);

    // ── Seed Methods ────────────────────────────────────────────────────
    const methodIdMap = new Map<string, number>();
    let methodCount = 0;

    for (const m of PSM_METHOD_CATALOG) {
      const categoryId = categoryIdMap.get(m.categorySlug);
      if (!categoryId) {
        console.warn(`[PSMDB Seed] Unknown category: ${m.categorySlug} for method ${m.slug}`);
        continue;
      }

      // Insert method
      const [method] = await db.insert(schema.psmMethods).values({
        categoryId,
        name: m.name,
        slug: m.slug,
        description: m.description,
        summary: m.summary,
        complexity: m.complexity,
        timeframe: m.timeframe,
        participantsMin: m.participantsMin,
        participantsMax: m.participantsMax,
        status: "active",
        version: 1,
      }).returning();
      methodIdMap.set(m.slug, method.id);
      methodCount++;

      // Insert definition
      await db.insert(schema.psmMethodDefinitions).values({
        methodId: method.id,
        version: 1,
        definition: m.summary,
        bestFor: m.bestFor,
        tools: m.tools,
        example: m.example,
        contentStatus: "published",
        publishedAt: new Date(),
      });

      // Insert workflow
      if (m.workflow && m.workflow.steps.length > 0) {
        const [wf] = await db.insert(schema.psmMethodWorkflows).values({
          methodId: method.id,
          version: 1,
          title: m.workflow.title,
          description: m.workflow.description,
        }).returning();

        for (const step of m.workflow.steps) {
          await db.insert(schema.psmMethodWorkflowSteps).values({
            workflowId: wf.id,
            stepNumber: step.title ? m.workflow.steps.indexOf(step) + 1 : 1,
            title: step.title,
            description: step.description,
            durationMinutes: step.durationMinutes,
            deliverable: step.deliverable,
          });
        }
      }

      // Insert aliases
      for (const alias of m.aliases) {
        await db.insert(schema.psmMethodAliases).values({ methodId: method.id, alias });
      }

      // Insert tags
      for (const tag of m.tags) {
        await db.insert(schema.psmMethodTags).values({ methodId: method.id, tag });
      }

      // Insert fit rules
      for (const rule of m.fitRules) {
        await db.insert(schema.psmMethodFitRules).values({
          methodId: method.id,
          dimension: rule.dimension,
          weight: String(rule.weight),
          minScore: String(rule.min),
          maxScore: String(rule.max),
        });
      }
    }

    console.log(`[PSMDB Seed] Seeded ${methodCount} methods with definitions, workflows, aliases, tags, and fit rules`);

    // ── Seed method relations (after all methods exist) ─────────────────
    let relCount = 0;
    for (const m of PSM_METHOD_CATALOG) {
      const methodId = methodIdMap.get(m.slug);
      if (!methodId) continue;
      for (const relSlug of m.relatedSlugs) {
        const relatedId = methodIdMap.get(relSlug);
        if (relatedId) {
          await db.insert(schema.psmMethodRelations).values({
            methodId,
            relatedMethodId: relatedId,
            relationType: "complement",
          });
          relCount++;
        }
      }
    }
    console.log(`[PSMDB Seed] Seeded ${relCount} method relations`);

    // ── Create initial content pack record ───────────────────────────────
    await db.insert(schema.psmContentPacks).values({
      name: "Canonical 100-Method Catalog v1",
      version: 1,
      description: "Initial seed of 100 problem-solving methods across 10 categories.",
      status: "published",
      itemCount: methodCount,
      publishedAt: new Date(),
    });

    // ── Audit event ────────────────────────────────────────────────────
    await db.insert(schema.psmAuditEvents).values({
      eventType: "content_imported",
      entityType: "content_pack",
      entityId: 1,
      metadata: { source: "seed", methodCount, categoryCount: categoryIdMap.size },
    });

    console.log("[PSMDB Seed] Complete");
  } catch (error) {
    console.error("[PSMDB Seed] Error:", error);
  }
}
