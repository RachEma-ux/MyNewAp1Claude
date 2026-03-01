/**
 * Agent Engine Orchestrator — Run planner + sequential step executor
 *
 * Phase 1: Template-based draft generation from wizard data (no LLM).
 * Phase 2: Replace template generators with LLM calls, add parallel DAG execution.
 *
 * The orchestrator:
 *   1. Creates a run plan from DAG template + pack
 *   2. Executes nodes sequentially (respecting dependency order)
 *   3. For each node: resolve binding → check guards → generate draft → store → audit
 */

import { eq } from "drizzle-orm";
import { createHash } from "crypto";
import { getDb } from "../../db/connection";
import { projects } from "./schema";
import { pmtAgentRuns, pmtAgentDrafts, pmtAgentAudit } from "./agent-engine-schema";
import {
  CATALOG_BINDINGS,
  getDagTemplate,
  getBinding,
  type DagNode,
  type RunType,
  type AgentAuditEventType,
} from "@shared/pm-agent-engine";
import {
  assertActionAllowed,
  assertPhaseAllowed,
  assertHumanReviewRequired,
  validateBindingShape,
} from "./agent-engine-guards";

// ── Run Plan Creation ───────────────────────────────────────────────────────

/**
 * Build a run plan from a DAG template.
 * Returns a fresh copy of DAG nodes with all statuses set to "pending".
 */
export function createRunPlan(runType: string): DagNode[] {
  const template = getDagTemplate(runType);
  if (!template) {
    throw new Error(`Unknown run type: ${runType}`);
  }
  return template;
}

// ── Audit Helper ────────────────────────────────────────────────────────────

async function emitAudit(
  runId: number,
  agentAlias: string,
  eventType: AgentAuditEventType,
  payload: Record<string, unknown>,
  actorId?: number,
) {
  const db = getDb();
  if (!db) return;

  const payloadStr = JSON.stringify(payload);
  const payloadHash = createHash("sha256").update(payloadStr).digest("hex").substring(0, 64);

  await db.insert(pmtAgentAudit).values({
    runId,
    agentAlias,
    eventType,
    payload,
    payloadHash,
    actorId: actorId || null,
  });
}

// ── Template-Based Draft Generators ─────────────────────────────────────────

function generateCharterDraft(metadata: Record<string, unknown>): Record<string, unknown> {
  return {
    artifactType: "charter_draft",
    title: `Project Charter — ${metadata.name || "Untitled"}`,
    sections: {
      projectName: metadata.name || "",
      sponsor: metadata.sponsor || "",
      projectManager: metadata.projectManager || "",
      objective: metadata.objective || "",
      businessCase: metadata.businessCase || "",
      problemStatement: metadata.problemStatement || "",
      expectedValue: metadata.expectedValue || [],
      inScope: metadata.inScope || [],
      outOfScope: metadata.outOfScope || [],
      deliverables: metadata.deliverables || [],
      constraints: metadata.constraints || "",
      assumptions: metadata.assumptions || "",
    },
    generatedBy: "charter_drafter",
    generatedAt: new Date().toISOString(),
    status: "draft",
  };
}

function generateScopeAnalysis(metadata: Record<string, unknown>): Record<string, unknown> {
  const inScope = (metadata.inScope as string[]) || [];
  const outOfScope = (metadata.outOfScope as string[]) || [];
  const deliverables = (metadata.deliverables as string[]) || [];

  return {
    artifactType: "scope_analysis",
    summary: {
      inScopeCount: inScope.length,
      outOfScopeCount: outOfScope.length,
      deliverablesCount: deliverables.length,
      completeness: inScope.length > 0 && deliverables.length > 0 ? "adequate" : "needs_attention",
    },
    gaps: inScope.length === 0 ? ["No in-scope items defined"] : [],
    recommendations: deliverables.length === 0
      ? ["Define at least one deliverable before proceeding"]
      : [],
    generatedBy: "scope_analyst",
    generatedAt: new Date().toISOString(),
  };
}

function generateStakeholderMap(metadata: Record<string, unknown>): Record<string, unknown> {
  const stakeholders = (metadata.stakeholders as Array<Record<string, unknown>>) || [];

  return {
    artifactType: "stakeholder_map",
    summary: {
      totalStakeholders: stakeholders.length,
      byInfluence: {
        high: stakeholders.filter((s) => s.influence === "high").length,
        medium: stakeholders.filter((s) => s.influence === "medium").length,
        low: stakeholders.filter((s) => s.influence === "low").length,
      },
    },
    engagementGaps: stakeholders.length === 0
      ? ["No stakeholders identified — critical gap"]
      : [],
    recommendations: stakeholders.length < 3
      ? ["Consider identifying more stakeholders for comprehensive coverage"]
      : [],
    generatedBy: "stakeholder_mapper",
    generatedAt: new Date().toISOString(),
  };
}

function generateRiskScreen(metadata: Record<string, unknown>): Record<string, unknown> {
  const risks = (metadata.initialRisks as Array<Record<string, unknown>>) || [];

  return {
    artifactType: "risk_screen",
    summary: {
      totalRisks: risks.length,
      byProbability: {
        high: risks.filter((r) => r.probability === "high").length,
        medium: risks.filter((r) => r.probability === "medium").length,
        low: risks.filter((r) => r.probability === "low").length,
      },
    },
    gaps: risks.length === 0 ? ["No risks identified — consider risk identification workshop"] : [],
    recommendations: risks.filter((r) => !r.mitigation).length > 0
      ? ["Some risks lack mitigation strategies"]
      : [],
    generatedBy: "risk_screener",
    generatedAt: new Date().toISOString(),
  };
}

function generateReadinessCheck(metadata: Record<string, unknown>, phase: string): Record<string, unknown> {
  const checks: Array<{ item: string; status: string; note: string }> = [];

  if (phase === "initiating") {
    checks.push(
      { item: "Project name", status: metadata.name ? "pass" : "fail", note: "" },
      { item: "Sponsor assigned", status: metadata.sponsor ? "pass" : "fail", note: "" },
      { item: "PM assigned", status: metadata.projectManager ? "pass" : "fail", note: "" },
      { item: "Business case", status: metadata.businessCase ? "pass" : "fail", note: "" },
      { item: "Scope defined", status: (metadata.inScope as string[])?.length > 0 ? "pass" : "fail", note: "" },
      { item: "Deliverables defined", status: (metadata.deliverables as string[])?.length > 0 ? "pass" : "fail", note: "" },
      { item: "Risks identified", status: (metadata.initialRisks as unknown[])?.length > 0 ? "pass" : "warn", note: "Recommended but not required" },
      { item: "Stakeholders identified", status: (metadata.stakeholders as unknown[])?.length > 0 ? "pass" : "fail", note: "" },
    );
  } else {
    checks.push(
      { item: "Scope baseline", status: metadata.scopeStatement ? "pass" : "fail", note: "" },
      { item: "Schedule baseline", status: (metadata.scheduleTasks as unknown[])?.length > 0 ? "pass" : "fail", note: "" },
      { item: "Cost baseline", status: (metadata.budgetItems as unknown[])?.length > 0 ? "pass" : "fail", note: "" },
      { item: "Quality plan", status: metadata.qualityStandards ? "pass" : "fail", note: "" },
      { item: "Risk register", status: (metadata.riskRegister as unknown[])?.length > 0 ? "pass" : "fail", note: "" },
    );
  }

  const passCount = checks.filter((c) => c.status === "pass").length;
  const failCount = checks.filter((c) => c.status === "fail").length;

  return {
    artifactType: "readiness_check",
    phase,
    checks,
    summary: {
      total: checks.length,
      pass: passCount,
      fail: failCount,
      warn: checks.length - passCount - failCount,
      ready: failCount === 0,
      score: Math.round((passCount / checks.length) * 100),
    },
    generatedBy: "readiness_checker",
    generatedAt: new Date().toISOString(),
  };
}

function generateScheduleDraft(metadata: Record<string, unknown>): Record<string, unknown> {
  const tasks = (metadata.scheduleTasks as Array<Record<string, unknown>>) || [];
  const milestones = (metadata.milestones as Array<Record<string, unknown>>) || [];

  return {
    artifactType: "schedule_draft",
    summary: {
      totalTasks: tasks.length,
      totalMilestones: milestones.length,
    },
    recommendations: tasks.length === 0
      ? ["No tasks defined — create a work breakdown structure first"]
      : [],
    generatedBy: "schedule_builder",
    generatedAt: new Date().toISOString(),
  };
}

function generateCostEstimate(metadata: Record<string, unknown>): Record<string, unknown> {
  const budgetItems = (metadata.budgetItems as Array<Record<string, unknown>>) || [];
  const totalBudget = budgetItems.reduce((sum, item) => {
    return sum + (Number(item.amount) || 0);
  }, 0);

  return {
    artifactType: "cost_estimate",
    summary: {
      totalItems: budgetItems.length,
      totalBudget,
      currency: "USD",
    },
    recommendations: budgetItems.length === 0
      ? ["No budget items defined — estimate costs for each WBS element"]
      : [],
    generatedBy: "cost_estimator",
    generatedAt: new Date().toISOString(),
  };
}

function generateQualityCheck(metadata: Record<string, unknown>): Record<string, unknown> {
  const standards = metadata.qualityStandards || "";
  const criteria = (metadata.acceptanceCriteria as string[]) || [];

  return {
    artifactType: "quality_check",
    summary: {
      standardsDefined: !!standards,
      criteriaCount: criteria.length,
      definitionOfDoneDefined: !!metadata.definitionOfDone,
    },
    gaps: [
      ...(!standards ? ["No quality standards defined"] : []),
      ...(criteria.length === 0 ? ["No acceptance criteria defined"] : []),
    ],
    generatedBy: "quality_checker",
    generatedAt: new Date().toISOString(),
  };
}

function generateRiskAnalysis(metadata: Record<string, unknown>): Record<string, unknown> {
  const risks = (metadata.riskRegister as Array<Record<string, unknown>>) ||
    (metadata.initialRisks as Array<Record<string, unknown>>) || [];

  const highRisks = risks.filter((r) => r.probability === "high" || r.impact === "high");

  return {
    artifactType: "risk_analysis",
    summary: {
      totalRisks: risks.length,
      highRiskCount: highRisks.length,
      mitigationCoverage: risks.length > 0
        ? Math.round((risks.filter((r) => !!r.mitigation).length / risks.length) * 100)
        : 0,
    },
    heatMap: {
      high_high: risks.filter((r) => r.probability === "high" && r.impact === "high").length,
      high_medium: risks.filter((r) => r.probability === "high" && r.impact === "medium").length,
      medium_high: risks.filter((r) => r.probability === "medium" && r.impact === "high").length,
      medium_medium: risks.filter((r) => r.probability === "medium" && r.impact === "medium").length,
      low_low: risks.filter((r) => r.probability === "low" && r.impact === "low").length,
    },
    recommendations: highRisks.length > 0
      ? ["High-risk items detected — ensure contingency plans are in place"]
      : ["Risk profile is manageable"],
    generatedBy: "risk_analyst",
    generatedAt: new Date().toISOString(),
  };
}

// ── Draft Generator Dispatch ────────────────────────────────────────────────

function generateDraft(
  agentAlias: string,
  metadata: Record<string, unknown>,
  phase: string,
): Record<string, unknown> | null {
  switch (agentAlias) {
    case "charter_drafter": return generateCharterDraft(metadata);
    case "scope_analyst": return generateScopeAnalysis(metadata);
    case "stakeholder_mapper": return generateStakeholderMap(metadata);
    case "risk_screener": return generateRiskScreen(metadata);
    case "readiness_checker": return generateReadinessCheck(metadata, phase);
    case "schedule_builder": return generateScheduleDraft(metadata);
    case "cost_estimator": return generateCostEstimate(metadata);
    case "quality_checker": return generateQualityCheck(metadata);
    case "risk_analyst": return generateRiskAnalysis(metadata);
    case "_system": return null; // System nodes don't produce drafts
    default: return null;
  }
}

// ── Run Executor ────────────────────────────────────────────────────────────

/**
 * Execute a run: iterate DAG nodes sequentially.
 * For each node:
 *   1. Resolve catalog binding (validate alias exists)
 *   2. Check phase guard
 *   3. Generate template-based draft from wizard data
 *   4. Store draft in pmt_agent_drafts
 *   5. Emit audit event
 *   6. Mark node completed
 */
export async function executeRun(runId: number, userId?: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("DB unavailable");

  // Load the run
  const runs = await db.select().from(pmtAgentRuns).where(eq(pmtAgentRuns.id, runId)).limit(1);
  const run = runs[0];
  if (!run) throw new Error(`Run ${runId} not found`);
  if (run.status === "cancelled") return;

  // Load project metadata (wizard data)
  const projs = await db.select().from(projects).where(eq(projects.id, run.projectId)).limit(1);
  const project = projs[0];
  if (!project) throw new Error(`Project ${run.projectId} not found`);
  const metadata = (project.metadata || {}) as Record<string, unknown>;

  // Determine phase from run type
  const phase = run.runType.includes("initiating") ? "initiating"
    : run.runType.includes("planning") ? "planning"
    : (project.status || "initiating");

  // Mark run as running
  const dagNodes = (run.planDag || []) as Array<{
    id: string; agent_alias: string; depends_on: string[]; status: string;
  }>;

  await db.update(pmtAgentRuns)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(pmtAgentRuns.id, runId));

  await emitAudit(runId, "_system", "run_started", { runType: run.runType, packId: run.packId }, userId);

  // Execute nodes sequentially (Phase 1)
  try {
    for (const node of dagNodes) {
      // Check if run was cancelled
      const currentRun = await db.select({ status: pmtAgentRuns.status })
        .from(pmtAgentRuns).where(eq(pmtAgentRuns.id, runId)).limit(1);
      if (currentRun[0]?.status === "cancelled") {
        node.status = "skipped";
        continue;
      }

      // Mark node as running
      node.status = "running";
      await db.update(pmtAgentRuns)
        .set({ planDag: dagNodes, updatedAt: new Date() })
        .where(eq(pmtAgentRuns.id, runId));

      await emitAudit(runId, node.agent_alias, "step_started", { nodeId: node.id }, userId);

      try {
        // Resolve binding (skip system nodes)
        if (node.agent_alias !== "_system") {
          const binding = getBinding(node.agent_alias);
          if (!binding) {
            throw new Error(`Binding not found for alias: ${node.agent_alias}`);
          }

          // Validate binding shape
          const errors = validateBindingShape(binding);
          if (errors.length > 0) {
            throw new Error(`Invalid binding "${node.agent_alias}": ${errors.join("; ")}`);
          }

          await emitAudit(runId, node.agent_alias, "binding_resolved", {
            catalog_id: binding.catalog_id,
            pinned_digest: binding.pinned_digest,
          }, userId);

          // Generate draft
          const draft = generateDraft(node.agent_alias, metadata, phase);
          if (draft) {
            const requiresReview = assertHumanReviewRequired(binding);

            // Store draft
            await db.insert(pmtAgentDrafts).values({
              projectId: run.projectId,
              runId,
              artifactType: (draft.artifactType as string) || node.agent_alias,
              content: draft,
              sourceAgentAlias: node.agent_alias,
              requiresHumanReview: requiresReview,
              commitStatus: "pending",
            });

            await emitAudit(runId, node.agent_alias, "draft_created", {
              artifactType: draft.artifactType,
              requiresReview,
            }, userId);
          }
        }

        // Mark node completed
        node.status = "completed";
        await emitAudit(runId, node.agent_alias, "step_completed", { nodeId: node.id }, userId);

      } catch (err: any) {
        node.status = "failed";
        await emitAudit(runId, node.agent_alias, "step_failed", {
          nodeId: node.id,
          error: err.message,
        }, userId);

        // Don't fail the entire run on a single node failure — mark remaining as skipped
        // (Phase 2 could have more sophisticated error handling)
      }

      // Update DAG state
      await db.update(pmtAgentRuns)
        .set({ planDag: dagNodes, updatedAt: new Date() })
        .where(eq(pmtAgentRuns.id, runId));
    }

    // Determine final status
    const anyFailed = dagNodes.some((n) => n.status === "failed");
    const finalStatus = anyFailed ? "failed" : "completed";

    await db.update(pmtAgentRuns)
      .set({ status: finalStatus, planDag: dagNodes, updatedAt: new Date() })
      .where(eq(pmtAgentRuns.id, runId));

    await emitAudit(runId, "_system", anyFailed ? "run_failed" : "run_completed", {
      nodeStatuses: dagNodes.map((n) => ({ id: n.id, status: n.status })),
    }, userId);

  } catch (err: any) {
    await db.update(pmtAgentRuns)
      .set({ status: "failed", planDag: dagNodes, updatedAt: new Date() })
      .where(eq(pmtAgentRuns.id, runId));

    await emitAudit(runId, "_system", "run_failed", { error: err.message }, userId);
  }
}
