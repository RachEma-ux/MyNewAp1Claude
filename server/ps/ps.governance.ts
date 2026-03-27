/**
 * PS Governance — Admin Validation Queue
 *
 * Admin actions for the PS validation queue. Builds on the existing
 * lifecycle state machine (ps.lifecycle.ts):
 *
 *   DRAFT → SUBMITTED → VALIDATED → PUBLISHED | SENT_TO_PM
 *                      → REJECTED
 *
 * This module adds:
 *   - Approve (SUBMITTED → VALIDATED) with optional note
 *   - Reject  (SUBMITTED → REJECTED) with required reason
 *   - Override Scope (any non-terminal state) with required reason
 *   - Validation queue listing
 */

import { TRPCError } from "@trpc/server";
import { eq, inArray, desc } from "drizzle-orm";
import { getDb } from "../db/connection";
import { psProjects, type PsProject } from "../../drizzle/tables/ps";
import { logPsAudit } from "./ps.audit";
import { validatePSProject, rejectPSProject as lifecycleReject } from "./ps.lifecycle";

// ── Validation Queue — List projects awaiting review ─────────────────

export async function listValidationQueue(
  statusFilter?: string,
): Promise<PsProject[]> {
  const db = getDb();
  if (!db) return [];

  if (statusFilter) {
    return db
      .select()
      .from(psProjects)
      .where(eq(psProjects.status, statusFilter.toUpperCase()))
      .orderBy(desc(psProjects.createdAt));
  }

  // Default: show all projects in the governance pipeline
  return db
    .select()
    .from(psProjects)
    .orderBy(desc(psProjects.createdAt));
}

// ── Approve (SUBMITTED → VALIDATED) ─────────────────────────────────

export async function approvePSProject(
  id: number,
  note: string | null,
  actorId: number,
): Promise<PsProject> {
  const db = getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });

  // Use lifecycle transition (enforces SUBMITTED → VALIDATED)
  const updated = await validatePSProject(id, actorId);

  // Write validation metadata
  await db
    .update(psProjects)
    .set({
      validationNote: note || null,
      validatedBy: actorId,
      validatedAt: new Date(),
    })
    .where(eq(psProjects.id, id));

  await logPsAudit({
    actorId,
    action: "governance.approve",
    entityType: "ps_project",
    entityId: id,
    newValue: { status: "VALIDATED", validationNote: note },
  });

  // Re-read for fresh data
  const [fresh] = await db
    .select()
    .from(psProjects)
    .where(eq(psProjects.id, id))
    .limit(1);

  return fresh ?? updated;
}

// ── Reject (SUBMITTED → REJECTED) ──────────────────────────────────

export async function rejectPSProjectWithNote(
  id: number,
  note: string,
  actorId: number,
): Promise<PsProject> {
  if (!note.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Rejection reason is required.",
    });
  }

  const db = getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });

  // Use lifecycle transition (enforces SUBMITTED → REJECTED)
  const updated = await lifecycleReject(id, actorId);

  // Write validation metadata
  await db
    .update(psProjects)
    .set({
      validationNote: note.trim(),
      validatedBy: actorId,
      validatedAt: new Date(),
    })
    .where(eq(psProjects.id, id));

  await logPsAudit({
    actorId,
    action: "governance.reject",
    entityType: "ps_project",
    entityId: id,
    newValue: { status: "REJECTED", validationNote: note },
  });

  const [fresh] = await db
    .select()
    .from(psProjects)
    .where(eq(psProjects.id, id))
    .limit(1);

  return fresh ?? updated;
}

// ── Override Scope ──────────────────────────────────────────────────

export async function overridePSProjectScope(
  id: number,
  newScopeCode: string,
  reason: string,
  actorId: number,
): Promise<PsProject> {
  const db = getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });

  if (!newScopeCode.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "New scope code is required.",
    });
  }

  if (!reason.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Override reason is required.",
    });
  }

  // Load project
  const [project] = await db
    .select()
    .from(psProjects)
    .where(eq(psProjects.id, id))
    .limit(1);

  if (!project) {
    throw new TRPCError({ code: "NOT_FOUND", message: "PS project not found" });
  }

  // Cannot override after publish or handoff to PM
  if (project.status === "PUBLISHED" || project.status === "SENT_TO_PM") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot override scope after project has been published or sent to PM Central.",
    });
  }

  const previousScope = project.selectedScopeCode;

  const [updated] = await db
    .update(psProjects)
    .set({
      selectedScopeCode: newScopeCode.trim(),
      validationNote: `Scope overridden: ${previousScope} → ${newScopeCode.trim()}. Reason: ${reason.trim()}`,
      validatedBy: actorId,
      validatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(psProjects.id, id))
    .returning();

  await logPsAudit({
    actorId,
    action: "governance.override_scope",
    entityType: "ps_project",
    entityId: id,
    previousValue: { selectedScopeCode: previousScope },
    newValue: {
      selectedScopeCode: newScopeCode.trim(),
      reason: reason.trim(),
    },
  });

  return updated;
}
