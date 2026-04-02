/**
 * PRM Service — Lifecycle orchestration, status machine, validation
 */

import { PRM_STATUS_TRANSITIONS, type PrmCaseStatus } from "./prm.types";
import * as repo from "./prm.repository";

// ── Status Machine ──────────────────────────────────────────────────────────

export function isValidTransition(from: PrmCaseStatus, to: PrmCaseStatus): boolean {
  const allowed = PRM_STATUS_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export async function advanceStatus(
  caseId: number,
  newStatus: PrmCaseStatus,
  actorUserId?: number,
  reason?: string
) {
  const caseRow = await repo.getCaseById(caseId);
  if (!caseRow) throw new Error(`Case ${caseId} not found`);

  const current = caseRow.status as PrmCaseStatus;
  if (!isValidTransition(current, newStatus)) {
    throw new Error(`Invalid transition: ${current} → ${newStatus}`);
  }

  // Evidence-first closure gate
  if (newStatus === "verified_closed") {
    const passedCount = await repo.countPassedVerifications(caseId);
    if (passedCount === 0) {
      throw new Error("Cannot close: at least one passed verification is required");
    }
  }

  const updateData: any = { status: newStatus };
  if (newStatus === "verified_closed") updateData.closedAt = new Date();
  if (newStatus === "reopened") {
    updateData.reopenedAt = new Date();
    updateData.reopenReason = reason || null;
    updateData.closedAt = null;
  }
  if (newStatus === "cancelled") updateData.closureReason = reason || "Cancelled";

  const updated = await repo.updateCase(caseId, updateData);

  // Create event
  await repo.createEvent({
    caseId,
    eventType: newStatus === "reopened" ? "reopen" : "status_change",
    fromStatus: current,
    toStatus: newStatus,
    actorUserId,
    reason,
  });

  return updated;
}

export async function reopenCase(caseId: number, reason: string, actorUserId?: number) {
  const caseRow = await repo.getCaseById(caseId);
  if (!caseRow) throw new Error(`Case ${caseId} not found`);
  if (caseRow.status !== "verified_closed") {
    throw new Error("Only verified_closed cases can be reopened");
  }
  return advanceStatus(caseId, "reopened", actorUserId, reason);
}

export async function closeCase(caseId: number, closureReason: string, actorUserId?: number) {
  const caseRow = await repo.getCaseById(caseId);
  if (!caseRow) throw new Error(`Case ${caseId} not found`);
  if (caseRow.status !== "verification_pending") {
    throw new Error("Case must be in verification_pending to close");
  }

  const passedCount = await repo.countPassedVerifications(caseId);
  if (passedCount === 0) {
    await repo.createEvent({
      caseId,
      eventType: "closure_blocked",
      fromStatus: caseRow.status,
      toStatus: "verified_closed",
      actorUserId,
      reason: "No passed verifications",
    });
    throw new Error("Closure blocked: at least one passed verification is required");
  }

  await repo.updateCase(caseId, { closureReason });
  const updated = await advanceStatus(caseId, "verified_closed", actorUserId, closureReason);

  await repo.createEvent({
    caseId,
    eventType: "closure_approved",
    fromStatus: "verification_pending",
    toStatus: "verified_closed",
    actorUserId,
    reason: closureReason,
  });

  return updated;
}

// ── Method Runs ─────────────────────────────────────────────────────────────

export async function completeMethodRun(runId: number, narrativeSummary?: string) {
  const run = await repo.getMethodRun(runId);
  if (!run) throw new Error(`Method run ${runId} not found`);
  if (run.status === "completed") throw new Error("Already completed");

  const updated = await repo.updateMethodRun(runId, {
    status: "completed",
    completedAt: new Date(),
    narrativeSummary: narrativeSummary || run.narrativeSummary,
  });

  await repo.createEvent({
    caseId: run.caseId,
    eventType: "method_completed",
    actorUserId: run.startedBy,
    metadata: { methodType: run.methodType, runId },
  });

  return updated;
}

// ── Actions ─────────────────────────────────────────────────────────────────

export async function completeAction(actionId: number, effectivenessResult?: string) {
  const updated = await repo.updateAction(actionId, {
    status: "completed",
    completedAt: new Date(),
    effectivenessResult,
  });
  if (!updated) throw new Error(`Action ${actionId} not found`);

  await repo.createEvent({
    caseId: updated.caseId,
    eventType: "action_completed",
    metadata: { actionId, actionType: updated.actionType },
  });

  return updated;
}
