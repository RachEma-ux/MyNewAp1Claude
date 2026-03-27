/**
 * PS → PM Bridge
 *
 * Sends a validated (VALIDATED) PS project to PM Central,
 * creating a PMT project and locking the PS classification.
 *
 * Rule: PS = Decision, PM Central = Execution.
 * After handoff, PS classification is locked (status = SENT_TO_PM).
 */

import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb } from "../db/connection";
import { psProjects, type PsProject } from "../../drizzle/tables/ps";
import { projects as pmtProjects } from "../modules/pmt/schema";
import { logPsAudit } from "./ps.audit";
import { sendToPMCentral } from "./ps.lifecycle";

/**
 * Create a PM Central project from a validated PS project.
 *
 * 1. Validates PS project status = VALIDATED
 * 2. Inserts into pmt_projects with PS metadata
 * 3. Transitions PS project: VALIDATED → SENT_TO_PM + links pmProjectId
 * 4. Returns the created PM project and locked PS project
 */
export async function createPMProjectFromPS(
  psProjectId: number,
  workspaceId: number,
  actorId: number,
) {
  const db = getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });

  // 1. Load PS project
  const [psProject] = await db
    .select()
    .from(psProjects)
    .where(eq(psProjects.id, psProjectId))
    .limit(1);

  if (!psProject) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "PS project not found",
    });
  }

  if (psProject.status !== "VALIDATED") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `PS project must be validated (approved) before sending to PM. Current status: "${psProject.status}"`,
    });
  }

  if (psProject.pmProjectId) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "PS project has already been sent to PM Central.",
    });
  }

  // 2. Transaction: create PM project + lock PS project
  const result = await db.transaction(async (tx) => {
    // Create PMT project
    const [pmProject] = await tx
      .insert(pmtProjects)
      .values({
        workspaceId,
        name: psProject.name,
        description: buildPMDescription(psProject),
        status: "draft",
        ownerId: actorId,
        governanceStage: "initiation",
        metadata: {
          psProjectId: psProject.id,
          psSelectedScopeCode: psProject.selectedScopeCode,
          psConfidence: psProject.confidence,
          psMatrixVersionId: psProject.matrixVersionId,
          psWizardRunId: psProject.wizardRunId,
          origin: "ps_bridge",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Link PM project ID to PS project
    await tx
      .update(psProjects)
      .set({ pmProjectId: pmProject.id })
      .where(eq(psProjects.id, psProjectId));

    return pmProject;
  });

  // 3. Lifecycle transition: VALIDATED → SENT_TO_PM
  const locked = await sendToPMCentral(psProjectId, actorId);

  // 4. Audit
  await logPsAudit({
    actorId,
    action: "bridge.send_to_pm",
    entityType: "ps_project",
    entityId: psProjectId,
    newValue: {
      pmProjectId: result.id,
      pmProjectName: result.name,
      lockedScopeCode: psProject.selectedScopeCode,
    },
  });

  return { pmProject: result, psProject: locked };
}

// ── Helpers ──────────────────────────────────────────────────────────

function buildPMDescription(ps: PsProject): string {
  const lines: string[] = [];
  lines.push(`Created from PS Project #${ps.id}`);
  lines.push(`Scope: ${ps.selectedScopeCode}`);
  if (ps.confidence) lines.push(`Confidence: ${ps.confidence}`);
  if (ps.scenario) lines.push(`\nScenario:\n${ps.scenario}`);
  return lines.join("\n");
}
