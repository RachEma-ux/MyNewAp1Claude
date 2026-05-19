/**
 * AI Agent Studio — Boot Entry Point
 *
 * Phase 12.5: single-call boot for the entire Agent Studio module.
 * Called once from server/_core/index.ts at startup. Replaces both
 * the previous (implicit) DB-via-main-app pattern AND the Phase 10
 * scheduler self-start side effect.
 *
 * Why a wrapper module:
 *  - Keeps the platform-file edit at +1 line in _core/index.ts (under
 *    the 22-line additive footprint budget). Without this, we'd add
 *    5 lines for the seed try/catch + extra lines for any future
 *    Agent Studio boot work.
 *  - Formalizes the Phase 10 scheduler self-start. Previously the
 *    scheduler used a top-level `ensureSchedulerStarted()` side
 *    effect at module-load time, kicked off when the runtime
 *    sub-router imported it. That implicit pattern is fragile
 *    (depends on import order) — the explicit boot call here is
 *    cleaner and easier to audit.
 *  - Mirrors how server/_core/index.ts already wires per-module seed
 *    functions (seedWfDb, seedPrmDb, seedPsmDb, seedCodeDb).
 *
 * What this function does, in order:
 *  1. Seed ASDB — runs CREATE TABLE IF NOT EXISTS for all 32 ags_*
 *     tables. Idempotent. Failures logged but non-fatal.
 *  2. Start the Phase 10 scheduler — 60s tick loop that fires
 *     scheduled agents. Uses unref() so it doesn't keep the dev
 *     server alive after exit.
 */

export async function bootAgentStudio(): Promise<void> {
  // Step 1: ASDB schema seed (Phase 12.5)
  try {
    const { seedAsDb } = await import("./db/seed");
    await seedAsDb();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ASDB] Seed skipped — ${message}`);
  }

  // Step 2: Boot-time agent seeds (Phase 19 follow-up)
  //
  // Idempotent seed functions that materialize meta-agents required
  // for Studio self-hosting. Currently ships one: the Agent Studio
  // Expert (a meta-agent that creates other agents). Each seed
  // function checks for existing rows before inserting, so restarts
  // are safe — existing agents are skipped with a log line.
  //
  // Why boot-time instead of a one-shot SQL file:
  //  - Fresh dev installs, CI test runs, and the deployed tunnel
  //    all get the same agents without manual psql steps
  //  - Drizzle gives compile-time schema validation vs brittle SQL
  //  - Future meta-agents (QA bot, migration helper) slot in here
  try {
    const { seedAgentStudioExpert } = await import(
      "./db/seed-agent-studio-expert"
    );
    const result = await seedAgentStudioExpert();
    if (result.created) {
      console.log(
        `[ASDB] Agent Studio Expert seeded at id=${result.agentId}`
      );
    } else if (result.agentId > 0) {
      console.log(
        `[ASDB] Agent Studio Expert present at id=${result.agentId} (${result.reason})`
      );
    } else {
      console.warn(
        `[ASDB] Agent Studio Expert seed skipped: ${result.reason}`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ASDB] Agent Studio Expert seed failed: ${message}`);
  }

  // Step 2b: Boot-time seed for the 5 fixture agents (legacy parity).
  try {
    const { seedLegacyFixtures } = await import("./db/seed-legacy-fixtures");
    const result = await seedLegacyFixtures();
    if (result.created > 0) {
      console.log(
        `[ASDB] Legacy fixtures seeded — ${result.created} created, ${result.skipped} already present (of ${result.total})`
      );
    } else if (result.total > 0) {
      console.log(
        `[ASDB] Legacy fixtures present — ${result.skipped}/${result.total} already seeded`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ASDB] Legacy fixtures seed failed: ${message}`);
  }

  // Step 2c: Native Graph Workspace Phase 12.5 / 22 / 23 — graph-skill row seeds.
  //
  // After ASDB tables exist (Step 1), upsert the 16 default Cypher templates,
  // 7 default Graph Skill Packs, and 4 Golden Question suites. Idempotent
  // on every key. Failures per-row are logged but do not abort boot.
  try {
    const { seedGraphSkillRows } = await import("./db/seed-graph-skill-rows");
    const r = await seedGraphSkillRows();
    console.log(
      `[ASDB] Graph Skill seeds — templates: ${r.cypherTemplates.inserted} ins / ${r.cypherTemplates.updated} upd / ${r.cypherTemplates.failed} err; ` +
        `packs: ${r.graphSkillPacks.inserted} ins / ${r.graphSkillPacks.updated} upd / ${r.graphSkillPacks.failed} err; ` +
        `golden suites: ${r.goldenQuestions.suitesInserted} ins / ${r.goldenQuestions.suitesUpdated} upd; ` +
        `questions: ${r.goldenQuestions.questionsInserted} ins / ${r.goldenQuestions.questionsUpdated} upd / ${r.goldenQuestions.failed} err`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ASDB] Graph Skill row seed skipped — ${message}`);
  }

  // Step 2c.1: Native Graph Workspace Phase 15 — blessed vault templates.
  //
  // After ASDB tables exist (Step 1), upsert the 11 global vault
  // template rows so `agentStudio.vault.listTemplates({ vaultId })`
  // shows a useful starting set. Idempotent on `(vaultId=null,
  // templateKey)`. Failures per-row are logged but do not abort
  // boot.
  try {
    const { seedVaultTemplateRows } = await import(
      "./db/seed-vault-template-rows"
    );
    const r = await seedVaultTemplateRows();
    console.log(
      `[ASDB] Vault template seeds — inserted: ${r.inserted}, ` +
        `already-existing: ${r.alreadyExisting}, failed: ${r.failed}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ASDB] Vault template row seed skipped — ${message}`);
  }

  // Step 2d: Native Graph Workspace Phase 11 — promotion adapter wiring.
  //
  // Injects the Drizzle-backed PromotionAdapter into the promotion router
  // so submit/approve/reject/rollback procedures stop returning
  // PRECONDITION_FAILED. Skipped (logged) when getAsDb() returns null —
  // promotion router will continue to surface the precondition error
  // until the next boot succeeds against ASDB.
  try {
    const { getAsDb } = await import("./db/connection");
    const db = getAsDb();
    if (db) {
      const { AsdbPromotionAdapter } = await import(
        "./services/promotion/adapter-asdb"
      );
      const { _setPromotionAdapter } = await import(
        "./services/promotion/router"
      );
      _setPromotionAdapter(new AsdbPromotionAdapter({ db }));
    } else {
      console.warn(
        "[ags-promotion] adapter wiring skipped — no asdb connection",
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-promotion] adapter wiring skipped — ${message}`);
  }

  // Step 2e: Native Graph Workspace Phase 11.5 — graph change proposal adapter wiring.
  //
  // Injects the Drizzle-backed GraphChangeProposalAdapter into the graph
  // change proposals router so submit/approve/reject/withdraw procedures
  // stop returning PRECONDITION_FAILED. Skipped (logged) when getAsDb()
  // returns null — router will continue to surface the precondition
  // error until the next boot succeeds against ASDB.
  try {
    const { getAsDb } = await import("./db/connection");
    const db = getAsDb();
    if (db) {
      const { AsdbGraphChangeProposalAdapter } = await import(
        "./services/graph-change-proposals/adapter-asdb"
      );
      const { _setGraphChangeProposalAdapter } = await import(
        "./services/graph-change-proposals/router"
      );
      _setGraphChangeProposalAdapter(
        new AsdbGraphChangeProposalAdapter({ db }),
      );
    } else {
      console.warn(
        "[ags-graph-change-proposals] adapter wiring skipped — no asdb connection",
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-graph-change-proposals] adapter wiring skipped — ${message}`,
    );
  }

  // Step 3: Phase 10 scheduler — formalized boot path
  try {
    const { ensureSchedulerStarted } = await import("./services/scheduler");
    ensureSchedulerStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-scheduler] start skipped — ${message}`);
  }

  // Step 3.5: Phase 22 follow-up #612 — workspace-observability retention
  // cron. The Phase 22 arc shipped runRetentionSweep but had no scheduled
  // caller — operators had to fire it manually. Default 30-day sweep runs
  // daily at 03:00 UTC. Env-flag-gated via AGS_RETENTION_CRON_DISABLED.
  try {
    const { ensureRetentionCronStarted } = await import(
      "./services/workspace-observability/retention-cron"
    );
    ensureRetentionCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-retention-cron] start skipped — ${message}`);
  }

  // Step 3.6: Phase 22 follow-up #613 — stale-running background-job sweep
  // cron. The Phase 22 arc shipped failStaleRunningJobs but had no scheduled
  // caller — operators had to fire it manually to unstick phantom in-flight
  // rows. Default 10-minute tick with a 30-minute staleness threshold.
  // Env-flag-gated via AGS_STALE_RUNNING_CRON_DISABLED.
  try {
    const { ensureStaleRunningCronStarted } = await import(
      "./services/workspace-observability/stale-running-job-cron"
    );
    ensureStaleRunningCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-stale-running-cron] start skipped — ${message}`);
  }

  // Step 3.7: Phase 22 follow-up #622 — runtime-runs retention cron.
  // The ags_runtime_runs + ags_runtime_run_steps tables had no retention
  // path before #621 + #622. Default daily 04:00 UTC sweep (offset 1h
  // from #612 retention cron) with 30-day window. Env-flag-gated via
  // AGS_RUNTIME_RUNS_RETENTION_CRON_DISABLED.
  try {
    const { ensureRuntimeRunsRetentionCronStarted } = await import(
      "./services/runtime-runs-retention-cron"
    );
    ensureRuntimeRunsRetentionCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-runtime-runs-retention-cron] start skipped — ${message}`,
    );
  }

  // Step 3.8: Phase 22 follow-up #626 — tool-call-traces retention cron.
  // The ags_tool_call_traces table had no retention path before
  // #625 + #626. Default daily 05:00 UTC sweep (offset 1h from runtime-
  // runs sweep, 2h from workspace-observability sweep) with 30-day
  // window. Default dispatchResults=["ok"] preserves error+blocked
  // rows. Env-flag-gated via AGS_TOOL_CALL_TRACES_RETENTION_CRON_DISABLED.
  try {
    const { ensureToolCallTracesRetentionCronStarted } = await import(
      "./services/tool-call-traces-retention-cron"
    );
    ensureToolCallTracesRetentionCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-tool-call-traces-retention-cron] start skipped — ${message}`,
    );
  }

  // Step 3.9: Phase 22 follow-up #630 — mcp-transitions retention cron.
  // The ags_mcp_transitions table had no retention before #629 + #630.
  // Default daily 06:00 UTC sweep — 4th slot in the daily-sweep ladder
  // (03:00 ws-obs / 04:00 runtime-runs / 05:00 tool-call-traces /
  // 06:00 mcp-transitions). Env-flag-gated via
  // AGS_MCP_TRANSITIONS_RETENTION_CRON_DISABLED.
  try {
    const { ensureMcpTransitionsRetentionCronStarted } = await import(
      "./services/mcp-transitions-retention-cron"
    );
    ensureMcpTransitionsRetentionCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-mcp-transitions-retention-cron] start skipped — ${message}`,
    );
  }

  // Step 3.10: Phase 22 follow-up #634 — catalog-sync-log retention cron.
  // The ags_catalog_sync_log table had no retention before #633 + #634.
  // Default daily 07:00 UTC sweep — 5th slot in the daily-sweep ladder.
  // Env-flag-gated via AGS_CATALOG_SYNC_LOG_RETENTION_CRON_DISABLED.
  try {
    const { ensureCatalogSyncLogRetentionCronStarted } = await import(
      "./services/catalog-sync-log-retention-cron"
    );
    ensureCatalogSyncLogRetentionCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-catalog-sync-log-retention-cron] start skipped — ${message}`,
    );
  }

  // Step 3.11: Phase 22 follow-up #639 — rac-runtime-traces retention cron.
  // The ags_rac_runtime_traces + ags_rac_context_blocks tables had no
  // retention before #638 + #639. Default daily 08:00 UTC sweep — 6th
  // slot in the daily-sweep ladder. Cascades blocks before traces.
  // Env-flag-gated via AGS_RAC_RUNTIME_TRACES_RETENTION_CRON_DISABLED.
  try {
    const { ensureRacRuntimeTracesRetentionCronStarted } = await import(
      "./services/rac-runtime-traces-retention-cron"
    );
    ensureRacRuntimeTracesRetentionCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-rac-runtime-traces-retention-cron] start skipped — ${message}`,
    );
  }

  // Step 3.12: Phase 22 follow-up #646 — cag-pack-events retention cron.
  // The ags_cag_pack_events table accumulates one row per CAG pack
  // lifecycle event (pack_used / pack_validation_failed / etc) without
  // any retention path before #645 + #646. Default daily 09:00 UTC
  // sweep — 7th slot in the daily-sweep ladder. Env-flag-gated via
  // AGS_CAG_PACK_EVENTS_RETENTION_CRON_DISABLED.
  try {
    const { ensureCagPackEventsRetentionCronStarted } = await import(
      "./services/cag-pack-events-retention-cron"
    );
    ensureCagPackEventsRetentionCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-cag-pack-events-retention-cron] start skipped — ${message}`,
    );
  }

  // Step 3.13: Phase 22 follow-up #650 — simulation-runs retention cron.
  // The ags_simulation_runs + ags_simulation_run_steps tables had no
  // retention before #649 + #650. Default daily 10:00 UTC sweep — 8th
  // slot in the daily-sweep ladder. Cascades steps before parent runs.
  // Env-flag-gated via AGS_SIMULATION_RUNS_RETENTION_CRON_DISABLED.
  try {
    const { ensureSimulationRunsRetentionCronStarted } = await import(
      "./services/simulation-runs-retention-cron"
    );
    ensureSimulationRunsRetentionCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-simulation-runs-retention-cron] start skipped — ${message}`,
    );
  }

  // Step 3.14: Phase 22 follow-up #654 — test-runs retention cron.
  // The ags_test_runs + ags_test_run_results tables had no retention
  // before #653 + #654. Default daily 11:00 UTC sweep — 9th slot in
  // the daily-sweep ladder. Cascades per-case results before parent
  // runs. Env-flag-gated via AGS_TEST_RUNS_RETENTION_CRON_DISABLED.
  try {
    const { ensureTestRunsRetentionCronStarted } = await import(
      "./services/test-runs-retention-cron"
    );
    ensureTestRunsRetentionCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-test-runs-retention-cron] start skipped — ${message}`,
    );
  }

  // Step 3.15: Phase 22 follow-up #658 — graph-quality-scans retention cron.
  // The ags_graph_quality_scans + ags_graph_quality_findings tables had
  // no retention before #657 + #658. Default daily 12:00 UTC sweep —
  // 10th slot in the daily-sweep ladder. Cascades findings (child) before
  // parent scans — FK is NO ACTION, so parent-first would error.
  // Env-flag-gated via AGS_GRAPH_QUALITY_SCANS_RETENTION_CRON_DISABLED.
  try {
    const { ensureGraphQualityScansRetentionCronStarted } = await import(
      "./services/graph-quality-scans-retention-cron"
    );
    ensureGraphQualityScansRetentionCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-graph-quality-scans-retention-cron] start skipped — ${message}`,
    );
  }

  // Step 3.16: Phase 22 follow-up #662 — graph-correction-proposals retention cron.
  // The ags_graph_correction_proposals + ags_graph_correction_decisions +
  // ags_graph_correction_audit_events tables had no retention before
  // #661 + #662. Default daily 13:00 UTC sweep — 11th slot in the
  // daily-sweep ladder. Three-table cascade: decisions + audit_events
  // (parallel, both NO ACTION FKs) then proposals. Env-flag-gated via
  // AGS_GRAPH_CORRECTION_PROPOSALS_RETENTION_CRON_DISABLED.
  try {
    const { ensureGraphCorrectionProposalsRetentionCronStarted } =
      await import("./services/graph-correction-proposals-retention-cron");
    ensureGraphCorrectionProposalsRetentionCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-graph-correction-proposals-retention-cron] start skipped — ${message}`,
    );
  }

  // Step 3.17: Phase 22 follow-up #666 — graph-quality-agent-runs retention cron.
  // The ags_graph_quality_agent_runs table had no retention before
  // #665 + #666. Default daily 14:00 UTC sweep — 12th slot in the
  // daily-sweep ladder. Single-table (no FK children — graph-correction
  // proposals own their own retention via #661-#664). Env-flag-gated
  // via AGS_GRAPH_QUALITY_AGENT_RUNS_RETENTION_CRON_DISABLED.
  try {
    const { ensureGraphQualityAgentRunsRetentionCronStarted } = await import(
      "./services/graph-quality-agent-runs-retention-cron"
    );
    ensureGraphQualityAgentRunsRetentionCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-graph-quality-agent-runs-retention-cron] start skipped — ${message}`,
    );
  }

  // Step 3.18: Phase 22 follow-up #670 — ingestion-jobs retention cron.
  // The ags_ingestion_jobs table (Universal Ingestion Phase 2-3
  // lifecycle wrapper) had no retention before #669 + #670. Default
  // daily 15:00 UTC sweep — 13th slot in the daily-sweep ladder.
  // Single-table (agsIngestionArtifacts is a SIBLING not a child;
  // compliance-adjacent and out of scope). Env-flag-gated via
  // AGS_INGESTION_JOBS_RETENTION_CRON_DISABLED.
  try {
    const { ensureIngestionJobsRetentionCronStarted } = await import(
      "./services/ingestion-jobs-retention-cron"
    );
    ensureIngestionJobsRetentionCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-ingestion-jobs-retention-cron] start skipped — ${message}`,
    );
  }

  // Step 3.19: Phase 22 follow-up #674 — graph-change-proposals retention
  // cron. The Phase 11.5 structural-change proposal scaffolding
  // (ags_graph_change_proposals + items + decisions + audit_events)
  // had no retention before #673 + #674. Default daily 16:00 UTC
  // sweep — 14th slot in the daily-sweep ladder. 4-table cascade:
  // 3 children in parallel (all NO ACTION FK) then proposals.
  // Env-flag-gated via
  // AGS_GRAPH_CHANGE_PROPOSALS_RETENTION_CRON_DISABLED.
  try {
    const { ensureGraphChangeProposalsRetentionCronStarted } = await import(
      "./services/graph-change-proposals-retention-cron"
    );
    ensureGraphChangeProposalsRetentionCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-graph-change-proposals-retention-cron] start skipped — ${message}`,
    );
  }

  // Step 3.20: Phase 22 follow-up #677 — graph-agent runtime-traces
  // retention cron. Wraps the existing pruneRuntimeTraces (Phase 14 §3)
  // in a scheduled cron — the service had no cron before #677. Default
  // daily 17:00 UTC sweep — 15th slot in the daily-sweep ladder. 4-table
  // children-first cascade (skillRuntimeUsages + queryTemplateRuns +
  // graphAgentSteps + graphAgentRuns). 90-day default (matches the
  // existing service's DEFAULT_HORIZON_MS — decision-trace ledgers have
  // longer forensic value than per-tool-call traces). Env-flag-gated
  // via AGS_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_CRON_DISABLED.
  try {
    const { ensureGraphAgentRuntimeTracesRetentionCronStarted } =
      await import("./services/graph-agent/retention-cron");
    ensureGraphAgentRuntimeTracesRetentionCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-graph-agent-runtime-traces-retention-cron] start skipped — ${message}`,
    );
  }

  // Step 3.21–3.23: approval-lifecycle retention crons.
  //
  // Lifecycle-aware retention sweeps for the three approval-lifecycle
  // tables (agsPublishRequests / agsApprovalSteps / agsNotePromotions).
  // Unlike the age-only retention crons above, these re-validate per-row
  // eligibility against the 12-blocker retention predicate (active
  // release link / active version / holds / parent-lifecycle state /
  // retention window) before deletion. Standing principle (user
  // 2026-05-12 §0): "Do not weaken the retention predicate to fit the
  // current schema."
  //
  // Default cron ladder slots: 18:00 / 19:00 / 20:00 UTC (16th-18th
  // slots). 90-day retention default — longer than the 30-day default
  // for operational tables because approval-lifecycle records carry
  // compliance significance.
  //
  // Env-flag-gated via the per-table _CRON_DISABLED flag.

  try {
    const { ensurePublishRequestsRetentionCronStarted } = await import(
      "./services/publish-requests-retention-cron"
    );
    ensurePublishRequestsRetentionCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-publish-requests-retention-cron] start skipped — ${message}`,
    );
  }

  try {
    const { ensureApprovalStepsRetentionCronStarted } = await import(
      "./services/approval-steps-retention-cron"
    );
    ensureApprovalStepsRetentionCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-approval-steps-retention-cron] start skipped — ${message}`,
    );
  }

  try {
    const { ensureNotePromotionsRetentionCronStarted } = await import(
      "./services/note-promotions-retention-cron"
    );
    ensureNotePromotionsRetentionCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-note-promotions-retention-cron] start skipped — ${message}`,
    );
  }

  // Step 3.24 — strict-audit item #9 partial closure (2026-05-13):
  // projection drift cron. The DriftDetector existed pre-2026-05-13
  // but ran on-demand only via tRPC. This cron schedules it daily at
  // 04:30 UTC (slot #19 in the daily-sweep ladder; offset 30m from
  // runtime-runs at 04:00). Persists drift events to
  // ags_graph_projection_drift_events for operator follow-up.
  // Env-flag-gated via AGS_PROJECTION_DRIFT_CRON_DISABLED.
  try {
    const { ensureProjectionDriftCronStarted } = await import(
      "./services/graph/projection/drift-cron"
    );
    ensureProjectionDriftCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-projection-drift-cron] start skipped — ${message}`,
    );
  }

  // Step 3.25.1 — T-I.47/T-I.49 (2026-05-16): projection staleness cron.
  // 5-PR sub-arc (#1218-#1222) shipped the detector + orchestrator +
  // fetcher + admin tRPC + scheduled cron module. This step starts the
  // schedule at boot time. Runs daily at 04:15 UTC (slot between
  // runtime-runs sweep 04:00 and drift cron 04:30). Emits
  // `neo4j_projection_stale` events for each projection whose
  // most-recent successful run is older than the threshold (1h default).
  // Env-flag-gated via AGS_PROJECTION_STALENESS_CRON_DISABLED.
  try {
    const { ensureProjectionStalenessCronStarted } = await import(
      "./services/graph/projection/staleness-cron"
    );
    ensureProjectionStalenessCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-projection-staleness-cron] start skipped — ${message}`,
    );
  }

  // Step 3.25.b — Graph Projection Queue Drain cron. Drains pending
  // rows in ags_graph_projection_sync_jobs every 5 minutes by passing
  // each through the ProjectionSyncWorker. Without this, the queue
  // grew unboundedly — #1477/#1478 wired producers but nothing
  // consumed the rows. Env-flag-gated via
  // AGS_PROJECTION_DRAIN_CRON_DISABLED.
  try {
    const { ensureProjectionDrainCronStarted } = await import(
      "./services/graph/projection/queue-drain-cron"
    );
    ensureProjectionDrainCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-projection-drain-cron] start skipped — ${message}`,
    );
  }

  // Step 3.25.c — Semantic Enrichment auto-promote cron (T-D.4).
  // Every 15 minutes, scans ags_semantic_enrichment_proposals for
  // pending rows whose confidence >= 0.95 and promotes them onto the
  // graph-correction triage surface. The graph mutation step stays
  // operator-gated. Env-flag-gated via
  // AGS_SEMANTIC_ENRICHMENT_AUTO_PROMOTE_CRON_DISABLED.
  try {
    const { ensureAutoPromoteCronStarted } = await import(
      "./services/graph-enrichment/auto-promote-cron"
    );
    ensureAutoPromoteCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-semantic-enrichment-auto-promote-cron] start skipped — ${message}`,
    );
  }

  // Step 3.26 — V1+ Phase 19-β (2026-05-13): register default publish
  // pushers for the three target types defined in PR-V1-2 (#749):
  // staging_env, remote_vault, external_kb. PR-V1-2 shipped the
  // executor + registry + ledger but the registry was empty, so
  // executePublish() always threw PublishPusherNotRegisteredError.
  // This wire-up gives operators a usable default; pusher-specific
  // credentialFn closures can be injected here or per-target via the
  // registration overrides shape.
  try {
    const { registerDefaultPublishPushers } = await import(
      "./services/publish-targets/defaults"
    );
    // Default credentialFn is a no-op: returns null so the request
    // is sent without auth. Operator overrides via env or via a
    // future Phase 19-γ secret-binding surface. The publish target
    // record's `providerConnectionId` reference is the hook point
    // for that wiring.
    const registered = registerDefaultPublishPushers();
    console.log(
      `[ags-publish-targets] default pushers registered — ${registered.join(", ")}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-publish-targets] default pusher registration skipped — ${message}`,
    );
  }

  // Step 3.27 — V1+ AS-4 (2026-05-14): env-flag-gated default
  // governance-gate install for executePublish. PR-V1-31 (#782)
  // shipped the AS-2 default-gate registry and PR-V1-25 (#776)
  // shipped the AS-1 ApprovalSteps adapter; this wire-up composes
  // them via the AS-4 payload-based resolver and installs the
  // result when AGS_PUBLISH_GOVERNANCE_GATE=approval_steps_payload_resolver.
  // Default OFF — preserves existing "no gate ⇒ approved" behavior.
  try {
    const { maybeInstallDefaultGovernanceGate } = await import(
      "./services/publish-targets/install-default-governance-gate"
    );
    const result = maybeInstallDefaultGovernanceGate();
    if (result.installed) {
      console.log(
        `[ags-publish-targets] default governance gate installed — mode=${result.mode}`,
      );
    } else {
      console.log(
        `[ags-publish-targets] default governance gate not installed — env flag unset (executePublish defaults to approved when no per-call gate supplied)`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-publish-targets] default governance gate install skipped — ${message}`,
    );
  }

  // Step 3.28 — V1+ 17-γ follow-up (2026-05-14): env-flag-gated
  // default canvas projection events sink install. PR-V1-41 (#792)
  // shipped the sink registry with a no-op default; PR-V1-53 (#804)
  // shipped the ags_canvas_projection_events table; PR-V1-54 (#805)
  // shipped the ASDB-backed sink. This wire-up registers the sink
  // when AGS_CANVAS_PROJECTION_EVENTS_SINK=asdb. Default OFF —
  // preserves the silent-swallow default behavior on first install.
  try {
    const { maybeInstallDefaultCanvasProjectionEventsSink } = await import(
      "./services/canvas/install-default-projection-events-sink"
    );
    const result = maybeInstallDefaultCanvasProjectionEventsSink();
    if (result.installed) {
      console.log(
        `[ags-canvas-projection-events] default sink installed — mode=${result.mode}`,
      );
    } else {
      console.log(
        `[ags-canvas-projection-events] default sink not installed — env flag unset (events swallowed by no-op default)`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-canvas-projection-events] default sink install skipped — ${message}`,
    );
  }

  // Step 3.29 — V1+ 17-γ follow-up (2026-05-14): env-flag-gated
  // default canvas projection events drain scheduler install.
  // PR-V1-56..#810 shipped the drain helpers + module-singleton
  // tick wrapper; PR-V1-60 (#811) shipped this installer.
  // Env flag AGS_CANVAS_PROJECTION_EVENTS_DRAIN=interval →
  // installs setInterval that calls the tick on a fixed cadence.
  // Override AGS_CANVAS_PROJECTION_EVENTS_DRAIN_INTERVAL_MS (default
  // 60_000ms). Forwarder is OPERATOR-supplied via
  // `installCanvasProjectionEventsDrainForwarder` — this scheduler
  // does NOT install one; ticks are no-ops + WARN until a forwarder
  // is installed. Default OFF — preserves no-tick behavior on first
  // install.
  try {
    const { maybeInstallDefaultCanvasProjectionEventsDrainScheduler } =
      await import(
        "./services/canvas/install-default-projection-events-drain-scheduler"
      );
    const result = maybeInstallDefaultCanvasProjectionEventsDrainScheduler();
    if (result.installed) {
      console.log(
        `[ags-canvas-projection-events-drain] scheduler installed — mode=${result.mode} intervalMs=${result.intervalMs}`,
      );
    } else {
      console.log(
        `[ags-canvas-projection-events-drain] scheduler not installed — env flag unset (no automatic drain)`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-canvas-projection-events-drain] scheduler install skipped — ${message}`,
    );
  }

  // Step 3.30 — V1+ 17-γ follow-up (2026-05-14): env-flag-gated
  // default canvas projection events drain forwarder install.
  // PR-V1-79 (#830). Closes the "operator-supplied forwarder" gap:
  // the #811 scheduler ticks the drain on a fixed cadence, but a
  // tick with no forwarder is a no-op + WARN. This installer wires
  // a default forwarder when an operator opts in via env flag.
  //
  // AGS_CANVAS_PROJECTION_EVENTS_DRAIN_FORWARDER=log → installs a
  // log-only forwarder (one structured line per event). Useful for
  // smoke-tests + phased rollouts. Future `sync-worker` mode lands
  // in a separate installer under services/graph/projection/.
  // Default OFF — preserves operator-supplied semantics + WARN.
  try {
    const { maybeInstallDefaultCanvasProjectionEventsDrainForwarder } =
      await import(
        "./services/canvas/install-default-projection-events-drain-forwarder"
      );
    const result =
      await maybeInstallDefaultCanvasProjectionEventsDrainForwarder();
    if (result.installed) {
      console.log(
        `[ags-canvas-projection-events-drain] default forwarder installed — mode=${result.mode}`,
      );
    } else {
      console.log(
        `[ags-canvas-projection-events-drain] default forwarder not installed — env flag unset (operator-supplied via installCanvasProjectionEventsDrainForwarder)`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-canvas-projection-events-drain] default forwarder install skipped — ${message}`,
    );
  }

  // Step 3.31 — V1+ 18-γ follow-up (2026-05-14): env-flag-gated
  // default observability-only lane hooks install. PR-V1-82 (#833).
  // PR-V1-81 (#832) shipped the typed observability hook factory +
  // installObservabilityLaneHooks helper; this step wires an
  // env-flag opt-in at boot.
  //
  // AGS_EXTENSIONS_LANE_HOOKS_OBSERVABILITY=on → installs the
  // observability hooks for retrieve / assemble / compose lanes.
  // Anything else / unset → no-op (default OFF; the α "assert +
  // ledger" fallback runs unchanged).
  try {
    const { maybeInstallDefaultObservabilityLaneHooks } = await import(
      "./services/extensions/install-default-observability-lane-hooks"
    );
    const result = maybeInstallDefaultObservabilityLaneHooks();
    if (result.installed) {
      console.log(
        `[ags-extensions-lane-observability] installed — lanes=${result.installedLanes.join(",")}`,
      );
    } else {
      console.log(
        `[ags-extensions-lane-observability] not installed — env flag unset (α fallback active)`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-extensions-lane-observability] install skipped — ${message}`,
    );
  }

  // T-B.4 closure (Phase 18-γ): default static-data lane hooks
  // installer. Pairs with the observability installer above —
  // observability hooks log + ledger; static hooks contribute
  // operator-supplied data.
  //
  //   AGS_EXTENSIONS_LANE_HOOKS_STATIC=on → register empty static
  //     hooks for all 3 contracted lanes. Caller supplies real data
  //     tables via the public-api factories when production data
  //     is wired in.
  //
  //   Anything else / unset → no-op (default OFF).
  try {
    const { maybeInstallDefaultStaticLaneHooks } = await import(
      "./services/extensions/install-default-static-lane-hooks"
    );
    const result = maybeInstallDefaultStaticLaneHooks();
    if (result.installed) {
      console.log(
        `[ags-extensions-lane-static] installed — lanes=${result.installedLanes.join(",")}`,
      );
    } else {
      console.log(
        `[ags-extensions-lane-static] not installed — env flag unset`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-extensions-lane-static] install skipped — ${message}`);
  }

  // Step 3.32 — V1+ Phase MR-1 Phase-2 (2026-05-15): region routing
  // boot wiring. PR-V1-151. Env-flag-gated opt-in via AGS_REGION_ROUTING=on.
  // Single-region operators leave the flag unset; the bootstrap getAsDb()
  // continues to handle every read/write. Multi-region operators populate
  // ags_regions + ags_workspace_region_pins, then flip the flag — the
  // cache warms once at boot and the MR-3 shim consults it for every
  // getAsDbForWorkspace(workspaceId) call.
  try {
    const { maybeInstallRegionRouting } = await import(
      "./services/region/install-region-routing"
    );
    const result = await maybeInstallRegionRouting();
    if (result.installed) {
      console.log(
        `[ags-region-routing] installed — activeRegions=${result.activeRegionCount} pins=${result.pinCount} primary=${result.primaryRegionKey ?? "(none)"} pubsub=${result.pubsubSubscribed ? "on" : "off"}`,
      );
    } else {
      console.log(
        `[ags-region-routing] not installed — ${result.reason ?? "unknown"}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-region-routing] install skipped — ${message}`);
  }

  // Step 3.34 — D-RESUME-5 (2026-05-15): approval event bus cross-process
  // pubsub. PR-V1-165. Env-flag-gated opt-in via AGS_APPROVAL_BUS_PUBSUB=on.
  // Single-process operators leave the flag unset; the existing local
  // in-process bus continues to handle approvals. Multi-process operators
  // flip the flag — every emit fires Postgres NOTIFY and every LISTEN
  // notification re-emits on the local bus, so chat-stream waitFor on
  // process P1 receives approval-decided events from process P2.
  try {
    const { maybeInstallApprovalBusPubsub } = await import(
      "./services/runtime/install-approval-bus-pubsub"
    );
    const result = maybeInstallApprovalBusPubsub();
    if (result.installed) {
      console.log("[ags-approval-bus-pubsub] installed");
    } else {
      console.log(
        `[ags-approval-bus-pubsub] not installed — ${result.reason ?? "unknown"}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-approval-bus-pubsub] install skipped — ${message}`);
  }

  // Step 3.33 — V1+ Phase MR-1 Phase-2 (2026-05-15): region cache re-warm
  // cron. PR-V1-155. Defensive periodic re-warm so pin/region changes on
  // other replicas (no cross-process pub-sub yet) eventually become
  // visible to non-writer replicas. Also catches the edge case where a
  // hook closure threw and the cache stayed stale.
  // Default cadence: every 10 minutes. Env-flag-gated disable via
  // AGS_REGION_CACHE_REWARM_CRON_DISABLED.
  try {
    const { ensureRegionCacheRewarmCronStarted } = await import(
      "./services/region/region-cache-rewarm-cron"
    );
    ensureRegionCacheRewarmCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-region-cache-rewarm-cron] start skipped — ${message}`);
  }

  // Step 3.35 — V1+ Phase 24 T-F.7 (2026-05-15): default lens-stack
  // installer. Env-flag-gated: AGS_GRAPH_LENS_DEFAULTS_INSTALL=on and
  // AGS_GRAPH_LENS_STUB_RUNNERS_INSTALL=on. Both default OFF — the
  // lens-stack ships behind a feature flag because the concrete-per-
  // kind runners are still placeholder stubs. When both flags flip on,
  // the operator UI surfaces 8 default lens kinds (rag / rac / cag /
  // graph_skill / mcp / governance / runtime / institutional_memory)
  // with empty-state snapshots until concrete runners replace the
  // stubs (T-F.8+ slices).
  try {
    const { maybeInstallDefaultLensStack } = await import(
      "./services/graph-lens/public-api"
    );
    const result = maybeInstallDefaultLensStack();
    if (result.fullyInstalled) {
      console.log(
        `[ags-graph-lens] default lens-stack installed — lenses=${result.lenses.installedIds.length} runners=${result.runners.installedKinds.length}`,
      );
    } else if (result.lenses.installed || result.runners.installed) {
      console.log(
        `[ags-graph-lens] partial install — lenses=${result.lenses.installed} runners=${result.runners.installed}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-graph-lens] install skipped — ${message}`);
  }

  // Step 3.36 — V1+ Phase 24 T-F.70 (2026-05-16): real lens runners
  // boot composer. Env-flag-gated per-kind:
  //   AGS_GRAPH_LENS_<KIND>_RUNNER_INSTALL=on
  // for KIND in RUNTIME / GOVERNANCE / MCP / CAG / RAG / RAC /
  // GRAPH_SKILL / INSTITUTIONAL_MEMORY. Each flag is independent —
  // operators can enable any subset, the rest fall back to whatever
  // Step 3.35 installed (stubs when stub flag is on; nothing
  // otherwise).
  //
  // IMPORTANT: an operator who sets BOTH the stub install flag
  // (Step 3.35) AND a real install flag (this step) for the same kind
  // will get a `LensRunnerAlreadyRegisteredForKindError` at boot
  // because `registerLensRunner` rejects duplicate kind keys. This
  // try-catch swallows the error AND logs the per-kind perKind result
  // — boot continues with whichever runners did register. Pick ONE
  // strategy per kind: real OR stub, never both.
  try {
    const { maybeInstallAllLensRunnersWithAsdb } = await import(
      "./services/graph-lens/public-api"
    );
    const result = maybeInstallAllLensRunnersWithAsdb();
    if (result.installedCount > 0) {
      const installedKinds = Object.entries(result.perKind)
        .filter(([, installed]) => installed)
        .map(([kind]) => kind)
        .join(", ");
      console.log(
        `[ags-graph-lens] real lens runners installed — count=${result.installedCount}/8 fullyInstalled=${result.fullyInstalled} kinds=[${installedKinds}]`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-graph-lens] real runners install skipped — ${message}`);
  }

  // Step 3.25 — V1+ Phase J-1-β (2026-05-13): graph health-alert cron.
  // PR-V1-1 (#748) shipped the pure evaluator + persistence; this cron
  // wakes the scan automatically every 5 minutes so operators don't
  // need to invoke `runHealthAlertScan()` manually. Faster than the
  // daily retention crons because alerting needs minute-level
  // detection latency. Persists alert rows to ags_runtime_alerts.
  // Env-flag-gated via AGS_GRAPH_HEALTH_ALERT_CRON_DISABLED.
  try {
    const { ensureHealthAlertCronStarted } = await import(
      "./services/graph/health-alert-cron"
    );
    ensureHealthAlertCronStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-graph-health-alert-cron] start skipped — ${message}`,
    );
  }

  // Step 3b: H1-c5 (cycle-5 audit closure §H1-c5) — install MCP auto-sync
  // subscriber. Bridges live registry snapshots → agsMcpToolKnowledge
  // mirror so operator UIs see current tool catalog. Pre-cycle-5 the
  // function existed (`auto-sync.ts:installAutoSync`) but was never
  // called at boot, leaving the mirror permanently empty unless an
  // operator manually triggered `agentStudio.mcpSchemaSync.sync`.
  //
  // Resolver: env-flag-gated single-workspace fallback by default
  // (AGENT_STUDIO_AUTO_SYNC_WORKSPACE_ID). Multi-workspace deployments
  // inject a custom resolver via `setAutoSyncResolver()`. See
  // `services/mcp/auto-sync-resolver.ts` header for the full rationale.
  try {
    const { installAutoSync } = await import("./services/mcp/auto-sync");
    const { getAutoSyncResolver } = await import(
      "./services/mcp/auto-sync-resolver"
    );
    installAutoSync({
      resolveContext: (serverId: number) => getAutoSyncResolver()(serverId),
      onError: (err, serverId) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[ags-mcp-auto-sync] sync failed for serverId=${serverId}: ${msg}`,
        );
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-mcp-auto-sync] install skipped — ${message}`);
  }

  // Step 4: Public API handlers for agentStudio.agent.publish + agentStudio.run.execute
  try {
    const { registerPublicApi } = await import("../platform/modules/module-gateway");
    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.agent.publish",
      handler: async (input) => {
        const payload = input as {
          agentId: number;
          versionId: number;
          targetEnvironment: string;
          releaseNotes?: string;
          publishedBy?: number;
        };
        const repo = await import("./repository");
        return repo.publishRelease(payload);
      },
      descriptor: {
        key: "agentStudio.agent.publish",
        description:
          "Publish an agent (lifecycle-only flip + agsAgentReleases insert; no catalog writes)",
        // Plan v3 Phase 20 — see RECEIPT_POLICY.md.
        risk: "medium",
        receiptRequired: true,
      },
    });
    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.run.execute",
      handler: async (input) => {
        const payload = input as {
          agentId: number;
          versionId?: number;
          environment?: string;
          inputPayload?: Record<string, unknown>;
          triggeredBy?: number;
        };
        if (typeof payload?.agentId !== "number") throw new Error("agentId is required");
        const repo = await import("./repository");
        return repo.appendRuntimeRun({
          agentId: payload.agentId,
          versionId: payload.versionId,
          environment: payload.environment ?? "production",
          status: "queued",
          triggerType: "gateway",
          triggeredBy: payload.triggeredBy,
          inputPayload: payload.inputPayload ?? {},
        });
      },
      descriptor: {
        key: "agentStudio.run.execute",
        description: "Execute an agent run",
        risk: "medium",
        receiptRequired: true,
      },
    });

    // Plan v3 Phase 12 — provider/model binding gateway actions.
    // All six wrap server/agent-studio/bindings.ts. None return any
    // credential material.
    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.providerBindings.list",
      handler: async (input) => {
        const { agentId } = input as { agentId: number };
        if (typeof agentId !== "number") throw new Error("agentId is required");
        const { listBindingsForAgent } = await import("./bindings");
        return listBindingsForAgent(agentId);
      },
      descriptor: {
        key: "agentStudio.providerBindings.list",
        description: "List provider bindings for an agent (no credentials)",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.providerBindings.create",
      handler: async (input) => {
        const { upsertAgentProviderBinding } = await import("./bindings");
        const payload = input as Parameters<
          typeof upsertAgentProviderBinding
        >[0];
        return upsertAgentProviderBinding(payload);
      },
      descriptor: {
        key: "agentStudio.providerBindings.create",
        description:
          "Create a provider binding (calls Phase 8 eligibility gate)",
        risk: "medium",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.providerBindings.update",
      handler: async (input) => {
        const { upsertAgentProviderBinding } = await import("./bindings");
        const payload = input as Parameters<
          typeof upsertAgentProviderBinding
        >[0];
        return upsertAgentProviderBinding(payload);
      },
      descriptor: {
        key: "agentStudio.providerBindings.update",
        description:
          "Update an existing provider binding (re-runs eligibility gate)",
        risk: "medium",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.providerBindings.remove",
      handler: async (input) => {
        const { draftId, role } = input as { draftId: number; role?: string };
        if (typeof draftId !== "number") throw new Error("draftId is required");
        const { removeAgentProviderBinding } = await import("./bindings");
        const removed = await removeAgentProviderBinding(draftId, role);
        return { draftId, role: role ?? "primary", removed };
      },
      descriptor: {
        key: "agentStudio.providerBindings.remove",
        description: "Delete a provider binding by (draftId, role)",
        risk: "medium",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.providerBindings.validate",
      handler: async (input) => {
        const { draftId, role } = input as { draftId: number; role?: string };
        if (typeof draftId !== "number") throw new Error("draftId is required");
        const { validateBindingPolicy } = await import("./bindings");
        return validateBindingPolicy(draftId, role);
      },
      descriptor: {
        key: "agentStudio.providerBindings.validate",
        description:
          "Reference/policy validation of a binding — no upstream HTTP probe",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.providerBindings.resolveForRun",
      handler: async (input) => {
        const { resolveForRun } = await import("./bindings");
        const payload = input as Parameters<typeof resolveForRun>[0];
        return resolveForRun(payload);
      },
      descriptor: {
        key: "agentStudio.providerBindings.resolveForRun",
        description:
          "Resolve a binding for runtime use — returns refs only, no credentials",
        risk: "low",
        receiptRequired: false,
      },
    });

    // PMB Phase 30.1 — workspace-default-binding admin surface.
    // Three gateway actions wrap the upsert/delete/list primitives in
    // workspace-default-bindings.ts (29.1b). Reads do not require receipts;
    // writes do (D-WDB-7). The handlers do not return credential material.
    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.workspaceDefaultBindings.list",
      handler: async (input) => {
        const { workspaceId } = input as { workspaceId: number };
        if (typeof workspaceId !== "number")
          throw new Error("workspaceId is required");
        const { listWorkspaceDefaultBindings } = await import(
          "./workspace-default-bindings"
        );
        return listWorkspaceDefaultBindings(workspaceId);
      },
      descriptor: {
        key: "agentStudio.workspaceDefaultBindings.list",
        description: "List workspace default provider bindings (all roles)",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.workspaceDefaultBindings.upsert",
      handler: async (input) => {
        const { upsertWorkspaceDefaultBinding } = await import(
          "./workspace-default-bindings"
        );
        const payload = input as Parameters<
          typeof upsertWorkspaceDefaultBinding
        >[0];
        return upsertWorkspaceDefaultBinding(payload);
      },
      descriptor: {
        key: "agentStudio.workspaceDefaultBindings.upsert",
        description:
          "Set or update the workspace default provider binding for a role (chat / embedding / tool / classifier); calls Phase 8 eligibility gate",
        risk: "medium",
        receiptRequired: true,
      },
    });

    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.workspaceDefaultBindings.delete",
      handler: async (input) => {
        const { deleteWorkspaceDefaultBinding } = await import(
          "./workspace-default-bindings"
        );
        const payload = input as Parameters<
          typeof deleteWorkspaceDefaultBinding
        >[0];
        const removed = await deleteWorkspaceDefaultBinding(payload);
        return { workspaceId: payload.workspaceId, role: payload.role, removed };
      },
      descriptor: {
        key: "agentStudio.workspaceDefaultBindings.delete",
        description:
          "Clear the workspace default provider binding for a role (idempotent)",
        risk: "medium",
        receiptRequired: true,
      },
    });

    // Plan v3 Phase 30 — Export Catalog gateway actions.
    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.exportCatalog.listCandidates",
      handler: async (input) => {
        const { listExportCandidates } = await import(
          "./services/export-catalog"
        );
        const { buildLiveLookups } = await import(
          "./services/export-catalog-lookups"
        );
        const payload = (input ?? {}) as Parameters<typeof listExportCandidates>[0];
        return listExportCandidates(payload, await buildLiveLookups());
      },
      descriptor: {
        key: "agentStudio.exportCatalog.listCandidates",
        description: "List Agent Studio export candidates (no credentials)",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.exportCatalog.getCandidate",
      handler: async (input) => {
        const { getExportCandidate } = await import(
          "./services/export-catalog"
        );
        const { buildLiveLookups } = await import(
          "./services/export-catalog-lookups"
        );
        const { agentId } = input as { agentId: number };
        if (typeof agentId !== "number") throw new Error("agentId is required");
        return getExportCandidate(agentId, await buildLiveLookups());
      },
      descriptor: {
        key: "agentStudio.exportCatalog.getCandidate",
        description: "Get a single Agent Studio export candidate",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.exportCatalog.exportCandidate",
      handler: async (input) => {
        const { prepareExportRegisterPayload } = await import(
          "./services/export-catalog"
        );
        const { buildLiveLookups } = await import(
          "./services/export-catalog-lookups"
        );
        const { gatewayCall } = await import(
          "../platform/modules/module-gateway"
        );
        const payload = input as { agentId: number; registeredBy: number };
        if (typeof payload?.agentId !== "number")
          throw new Error("agentId is required");
        if (typeof payload?.registeredBy !== "number")
          throw new Error("registeredBy is required");
        const prepared = await prepareExportRegisterPayload(
          { agentId: payload.agentId, registeredBy: payload.registeredBy },
          await buildLiveLookups(),
        );
        const registerResult = await gatewayCall({
          ctx: {
            sourceModule: "agentStudio",
            targetModule: "aiTypes",
            actionKey: "aiTypes.catalog.register",
            governanceReceiptId:
              (input as any)?.governanceReceiptId ??
              `ags-export-${payload.agentId}-${Date.now()}`,
          },
          input: prepared.registerPayload,
        });
        return {
          ok: true,
          candidate: prepared.candidate,
          registerResult,
        };
      },
      descriptor: {
        key: "agentStudio.exportCatalog.exportCandidate",
        description:
          "Export a candidate via aiTypes.catalog.register (writes catalog_entries)",
        risk: "medium",
        receiptRequired: true,
      },
    });

    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.exportCatalog.markImported",
      handler: async (input) => {
        const { markCandidateImported } = await import(
          "./services/export-catalog"
        );
        const payload = input as { agentId: number; catalogEntryId: number };
        if (typeof payload?.agentId !== "number")
          throw new Error("agentId is required");
        if (typeof payload?.catalogEntryId !== "number")
          throw new Error("catalogEntryId is required");
        return markCandidateImported(payload);
      },
      descriptor: {
        key: "agentStudio.exportCatalog.markImported",
        description:
          "Confirm a successful import for a candidate (advisory marker)",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.exportCatalog.reconcileImports",
      handler: async (input) => {
        const { reconcileCandidateImports } = await import(
          "./services/export-catalog"
        );
        const { getDb } = await import("../db/connection");
        const db = getDb();
        if (!db) throw new Error("Database not available");
        const payload = input as {
          agentId: number;
          catalogEntryId: number;
          sourceVersionId: number;
          reconciledBy: number;
        };
        if (
          typeof payload?.agentId !== "number" ||
          typeof payload?.catalogEntryId !== "number" ||
          typeof payload?.sourceVersionId !== "number" ||
          typeof payload?.reconciledBy !== "number"
        ) {
          throw new Error(
            "agentId, catalogEntryId, sourceVersionId, reconciledBy are required",
          );
        }
        return reconcileCandidateImports(db, payload);
      },
      descriptor: {
        key: "agentStudio.exportCatalog.reconcileImports",
        description:
          "Admin override: reconcile a legacy_imported_unresolved catalog row to a specific source version",
        risk: "high",
        receiptRequired: true,
      },
    });

    // Plan v3 Phase 41 — bulk drift scan + repair of the AS catalog sync log.
    // Walks every published AS agent, joins to catalog_entries, compares
    // against ags_catalog_sync_log, and writes synthetic sync rows for
    // any drift case. Receipt-required because admins want a record
    // of "who ran the scan when."
    registerPublicApi({
      module: "agentStudio",
      action: "agentStudio.exportCatalog.reconcileSync",
      handler: async (input) => {
        const { reconcileExportCatalogSync } = await import(
          "./services/export-catalog"
        );
        const { buildReconcileLookups } = await import(
          "./services/export-catalog-lookups"
        );
        const payload = (input ?? {}) as {
          workspaceId?: number;
          reconciledBy?: number;
          dryRun?: boolean;
        };
        if (typeof payload?.reconciledBy !== "number") {
          throw new Error("reconciledBy is required");
        }
        return reconcileExportCatalogSync(
          {
            workspaceId: payload.workspaceId,
            reconciledBy: payload.reconciledBy,
            dryRun: payload.dryRun === true,
          },
          await buildReconcileLookups(),
        );
      },
      descriptor: {
        key: "agentStudio.exportCatalog.reconcileSync",
        description:
          "Bulk reconcile AS catalog sync log against catalog_entries (Phase 41 drift repair)",
        risk: "medium",
        receiptRequired: true,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-publicApi] registration skipped — ${message}`);
  }

  // Step 5: Handoff acceptor for agentStudio.run.requested
  //
  // Receives a request from another module (PM Central, Sandbox WF, etc.)
  // to start a runtime run for a known agent. The acceptor delegates to
  // the same `appendRuntimeRun` repository function the regular runtime
  // runner uses, so the handoff path and the in-process path produce
  // identical run records.
  try {
    const { registerHandoffAcceptor } = await import("../platform/handoff");
    // Literal type string used so check:wiring:handoff can verify
    // statically; AGENT_STUDIO_HANDOFFS.runRequested in handoffs.ts
    // is the canonical constant.
    registerHandoffAcceptor(
      "agentStudio",
      "agentStudio.run.requested",
      async (handoff) => {
        const payload = handoff.payload as {
          agentId?: number;
          versionId?: number;
          environment?: string;
          inputPayload?: Record<string, unknown>;
        };
        if (typeof payload?.agentId !== "number") {
          return { accepted: false, reason: "agentId missing from payload" };
        }
        try {
          const repo = await import("./repository");
          await repo.appendRuntimeRun({
            agentId: payload.agentId,
            versionId: payload.versionId,
            environment: payload.environment ?? "production",
            status: "queued",
            triggeredBy: typeof handoff.actorId === "number" ? handoff.actorId : undefined,
            triggerType: "handoff",
            inputPayload: payload.inputPayload ?? {},
          });
          return { accepted: true };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.warn(`[ags-handoff] agentStudio.run.requested failed: ${msg}`);
          return { accepted: false, reason: msg };
        }
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-handoff] acceptor registration skipped — ${message}`);
  }

  // Step 5.5: Plan v3 Phase 40 — subscribe to AI Types catalog lifecycle events.
  //
  // Three subscriptions wire AS to the catalog event bus so the AS-side
  // export-status mirror stays current without polling. Each handler
  // appends to ags_catalog_sync_log via `recordCatalogSyncEvent` — the
  // shared filter/parse logic lives in services/catalog-sync-subscribers.ts
  // (`processCatalogSyncEvent`) so the handlers here stay small and the
  // unit tests can drive synthetic envelopes without booting the module.
  //
  // Literal event type strings used so check:wiring:event can verify
  // statically; AI_TYPES_EVENTS in server/ai-types/events.ts is the
  // canonical constant.
  try {
    const { subscribeEvent } = await import("../platform/events");
    const { processCatalogSyncEvent } = await import(
      "./services/catalog-sync-subscribers"
    );
    const repo = await import("./repository");
    const recorder = async (input: any) =>
      repo.recordCatalogSyncEvent(input);
    subscribeEvent(
      "aiTypes.catalog.registered",
      "agentStudio",
      async (env) => {
        await processCatalogSyncEvent(
          "aiTypes.catalog.registered",
          env,
          recorder,
        );
      },
    );
    subscribeEvent("aiTypes.catalog.published", "agentStudio", async (env) => {
      await processCatalogSyncEvent(
        "aiTypes.catalog.published",
        env,
        recorder,
      );
    });
    subscribeEvent("aiTypes.catalog.deprecated", "agentStudio", async (env) => {
      await processCatalogSyncEvent(
        "aiTypes.catalog.deprecated",
        env,
        recorder,
      );
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ags-catalog-sync] subscriber registration skipped — ${message}`,
    );
  }

  // Step 6: MCP hardening Phase 5.1 — subscribe the persisted transition
  // log to the FSM event bus. Every successful FSM transition appends one
  // row to ags_mcp_transitions (capped per server inside the repo helper).
  // Subscriber runs async (decision #9b inside connection-events.ts) so a
  // slow DB write cannot block the FSM critical path.
  try {
    const { onTransition } = await import("./services/mcp/connection-events");
    const repo = await import("./repository");
    onTransition((t) => {
      const reason =
        ("reason" in t.to ? (t.to as { reason?: string }).reason : undefined) ??
        ("reason" in t.event
          ? (t.event as { reason?: string }).reason
          : undefined) ??
        null;
      void repo
        .recordMcpTransition(
          t.serverId,
          t.from.kind,
          t.to.kind,
          t.event.type,
          reason
        )
        .catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(
            `[ags-mcp] transition log write failed for #${t.serverId}: ${msg}`
          );
        });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-mcp] transition subscriber skipped — ${message}`);
  }
}

/**
 * Post-listen boot steps — MCP server auto-reconnect.
 *
 * Called from server/_core/index.ts AFTER `server.listen()` resolves,
 * because some MCP servers (notably `studio-self`) are http transports
 * that point at the Studio's own `/api/mcp` endpoint. If we auto-
 * connect before the listener is ready, those self-loop servers
 * fail with "fetch failed".
 *
 * Root cause this fixes: the MCP manager keeps connection state in a
 * process-local `connections` map and the registry keeps tool
 * snapshots in another process-local `snapshots` map. Both are reset
 * on every dev-server restart and on every HMR reload of the
 * mcp-manager module. The DB rows still read status="connected" from
 * the previous process lifetime, which is stale and misleading.
 *
 * Symptom users hit without this fix: chat with an agent whose draft
 * has MCP tools → chat-stream.ts buildToolsForDraft calls getSnapshot
 * → returns undefined → tools list passed to OpenAI is empty → the
 * model free-associates a tool call in prose instead of emitting a
 * structured tool_calls delta → output looks garbled/broken.
 *
 * ── L1-c5 (cycle-5 audit closure §L1-c5) — boot ordering race ──────
 *
 * Known race window: the listener accepts requests AS SOON AS
 * `server.listen()` resolves; this function runs sequentially AFTER
 * that point and may take O(seconds) when many MCP servers are
 * configured (each `connectMcpServer` does a stdio spawn / http
 * handshake + initial `tools/list` round-trip).
 *
 * Concretely: a chat request that arrives in that window calls
 * `dispatchMcpToolCall` → registry returns `tool_not_found` because
 * `publishSnapshot` has not yet been invoked for the relevant server.
 * The dispatcher's audit row records the failure with the correct
 * error code, so it is NOT silent — but it IS operationally
 * surprising on cold-start ("the same call worked five seconds ago").
 *
 * Mitigation chosen — DOC-ONLY (per audit §L1-c5 remediation menu):
 *
 *   Option A (chosen): document the race here so operators reading
 *     a `tool_not_found` immediately after a deploy can recognize
 *     the cold-start window. The dispatcher's existing error code
 *     (`tool_not_found`) is structurally correct; no new error
 *     needed.
 *
 *   Option B (rejected for cycle-5): add a process-level "MCP ready"
 *     gate (boolean flipped at the end of this function) and have
 *     the dispatcher reject with a new `service_warming_up` error
 *     before it. Wider blast-radius — would change runtime semantics
 *     for every dispatch path + add a new error code to the contract
 *     + need new UI surface to show the warming state. Defer to a
 *     future cycle if cold-start race becomes a frequent operational
 *     pain point.
 *
 * Lockstep test: `tests/agent-studio/boot-ordering-doc.test.ts`
 * asserts this doc-block carries the L1-c5 closure marker + names
 * both options + identifies why option A was chosen. A future PR
 * that strips the documentation (or quietly switches to option B
 * without updating the doc) fails the lockstep.
 */
export async function bootAgentStudioPostListen(): Promise<void> {
  try {
    const repo = await import("./repository");
    const { connectMcpServer } = await import("./services/mcp/mcp-manager");
    const servers = await repo.listAllMcpServers();
    let connected = 0;
    let failed = 0;
    for (const server of servers) {
      if (!server.enabled) continue;
      try {
        const result = await connectMcpServer({ serverId: server.id });
        if (result.status === "connected") {
          connected++;
        } else {
          failed++;
          console.warn(
            `[ags-mcp] auto-connect failed for #${server.id} ${server.name}: ${result.error ?? "unknown"}`
          );
        }
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(
          `[ags-mcp] auto-connect exception for #${server.id} ${server.name}: ${msg}`
        );
      }
    }
    if (connected > 0 || failed > 0) {
      console.log(
        `[ags-mcp] auto-connect: ${connected} connected, ${failed} failed`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-mcp] auto-connect skipped — ${message}`);
  }
}
