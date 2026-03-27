/**
 * PS Project Lifecycle — Strict state machine for PS projects.
 *
 * States: DRAFT → SUBMITTED → VALIDATED → SENT_TO_PM
 *                            → REJECTED
 *
 * Rules:
 *   DRAFT      → SUBMITTED
 *   SUBMITTED  → VALIDATED | REJECTED
 *   VALIDATED  → SENT_TO_PM
 *   REJECTED   → (terminal)
 *   SENT_TO_PM → (terminal)
 */

import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb } from "../db/connection";
import { psProjects } from "../../drizzle/tables/ps";
import { logPsAudit } from "./ps.audit";
import type { PsProjectStatus } from "./ps.types";
import { PS_PROJECT_TRANSITIONS } from "./ps.types";

// ── Transition helper ────────────────────────────────────────────────

function assertTransition(
  current: string,
  target: PsProjectStatus,
): void {
  const upper = current.toUpperCase() as PsProjectStatus;
  const allowed = PS_PROJECT_TRANSITIONS[upper];
  if (!allowed || !allowed.includes(target)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid transition: ${upper} → ${target}. Allowed: ${
        allowed?.length ? allowed.join(", ") : "none (terminal state)"
      }`,
    });
  }
}

async function transitionProject(
  projectId: number,
  targetStatus: PsProjectStatus,
  actorId: number,
) {
  const db = getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });

  const [project] = await db
    .select()
    .from(psProjects)
    .where(eq(psProjects.id, projectId))
    .limit(1);

  if (!project)
    throw new TRPCError({ code: "NOT_FOUND", message: "PS project not found" });

  assertTransition(project.status, targetStatus);

  const [updated] = await db
    .update(psProjects)
    .set({ status: targetStatus, updatedAt: new Date() })
    .where(eq(psProjects.id, projectId))
    .returning();

  await logPsAudit({
    actorId,
    action: `project.${targetStatus.toLowerCase()}`,
    entityType: "ps_project",
    entityId: projectId,
    previousValue: { status: project.status },
    newValue: { status: targetStatus },
  });

  return updated;
}

// ── Public API ───────────────────────────────────────────────────────

export async function submitPSProject(projectId: number, actorId: number) {
  return transitionProject(projectId, "SUBMITTED", actorId);
}

export async function validatePSProject(projectId: number, actorId: number) {
  return transitionProject(projectId, "VALIDATED", actorId);
}

export async function rejectPSProject(projectId: number, actorId: number) {
  return transitionProject(projectId, "REJECTED", actorId);
}

export async function sendToPMCentral(projectId: number, actorId: number) {
  return transitionProject(projectId, "SENT_TO_PM", actorId);
}
