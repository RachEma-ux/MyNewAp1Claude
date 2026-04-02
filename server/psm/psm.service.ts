/**
 * PSM Service — Business logic layer
 */

import * as repo from "./psm.repository";
import * as selector from "./psm.selector";

// ── Workflow Start ──────────────────────────────────────────────────────────

export async function startWorkflowRun(caseId: number, methodId: number, actorUserId?: number) {
  // Get the method workflow
  const workflow = await repo.getMethodWorkflow(methodId);
  if (!workflow) throw new Error("No workflow defined for this method");

  // Create the run
  const run = await repo.createRun({ caseId, methodId, workflowId: workflow.id });

  // Create step runs
  const stepCount = workflow.steps?.length || 0;
  if (stepCount > 0) {
    await repo.createStepRuns(run.id, stepCount);
  }

  // Update case status to active if still draft
  const caseRow = await repo.getCaseById(caseId);
  if (caseRow && caseRow.status === "draft") {
    await repo.updateCase(caseId, { status: "active" });
  }

  // Audit
  await repo.createAuditEvent({
    eventType: "run_started",
    entityType: "case_run",
    entityId: run.id,
    actorUserId,
    metadata: { caseId, methodId },
  });

  return run;
}

// ── Workflow Step Save ──────────────────────────────────────────────────────

export async function saveWorkflowStep(
  runId: number,
  stepNumber: number,
  data: { notes?: string; output?: any; status?: string },
  actorUserId?: number,
) {
  const step = await repo.saveStep(runId, stepNumber, data);

  // If step completed, advance current step on the run
  if (data.status === "completed" || data.status === "skipped") {
    const steps = await repo.getStepRuns(runId);
    const nextPending = steps.find((s: any) => s.status === "pending");
    if (nextPending) {
      await repo.updateRun(runId, { currentStep: nextPending.stepNumber });
      await repo.saveStep(runId, nextPending.stepNumber, { status: "in_progress" });
    }

    await repo.createAuditEvent({
      eventType: data.status === "completed" ? "step_completed" : "step_skipped",
      entityType: "case_step_run",
      entityId: step?.id,
      actorUserId,
      metadata: { runId, stepNumber },
    });
  }

  return step;
}

// ── Workflow Complete ────────────────────────────────────────────────────────

export async function completeWorkflowRun(runId: number, summary?: string, actorUserId?: number) {
  const run = await repo.updateRun(runId, {
    status: "completed",
    summary,
    completedAt: new Date(),
  });

  await repo.createAuditEvent({
    eventType: "run_completed",
    entityType: "case_run",
    entityId: runId,
    actorUserId,
    metadata: { summary: summary?.slice(0, 100) },
  });

  return run;
}

// ── Recommendation ──────────────────────────────────────────────────────────

export async function getRecommendations(
  dimensions: { dimension: string; score: number }[],
  caseId?: number,
  problemDescription?: string,
  limit = 10,
  actorUserId?: number,
) {
  const results = await selector.recommend(dimensions, problemDescription, limit);

  // If caseId provided, save inputs and recommendations
  if (caseId) {
    await repo.saveCaseInputs(caseId, dimensions.map(d => ({ dimension: d.dimension, score: d.score })));
    await repo.saveCaseRecommendations(
      caseId,
      results.map(r => ({
        methodId: r.methodId,
        score: r.totalScore,
        rank: r.rank,
        explanation: r.explanation,
        aiContributed: r.aiContributed,
      })),
    );
  }

  await repo.createAuditEvent({
    eventType: "recommendation_requested",
    entityType: "selector",
    entityId: caseId || 0,
    actorUserId,
    metadata: { dimensionCount: dimensions.length, resultCount: results.length },
  });

  return results;
}

// ── Content Lifecycle ───────────────────────────────────────────────────────

export async function publishContentPack(packId: number, actorUserId?: number, reason?: string) {
  const pack = await repo.getContentPack(packId);
  if (!pack) throw new Error("Content pack not found");
  if (pack.status !== "committed") throw new Error("Pack must be committed before publishing");

  const updated = await repo.updateContentPack(packId, {
    status: "published",
    publishedAt: new Date(),
  });

  await repo.addPublishLog({ packId, action: "publish", actorUserId, reason });
  await repo.createAuditEvent({
    eventType: "content_published",
    entityType: "content_pack",
    entityId: packId,
    actorUserId,
    metadata: { name: pack.name, version: pack.version },
  });

  return updated;
}

export async function rollbackContentPack(packId: number, actorUserId?: number, reason?: string) {
  const pack = await repo.getContentPack(packId);
  if (!pack) throw new Error("Content pack not found");
  if (pack.status !== "published") throw new Error("Only published packs can be rolled back");

  const updated = await repo.updateContentPack(packId, {
    status: "rolled_back",
    rolledBackAt: new Date(),
  });

  await repo.addPublishLog({ packId, action: "rollback", actorUserId, reason });
  await repo.createAuditEvent({
    eventType: "content_rolled_back",
    entityType: "content_pack",
    entityId: packId,
    actorUserId,
    metadata: { name: pack.name, reason },
  });

  return updated;
}
