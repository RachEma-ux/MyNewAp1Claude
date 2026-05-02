/**
 * PS → PM Central Bridge
 *
 * Sends a validated (VALIDATED) PS project to PM Central via the
 * canonical handoff lane and the Module Gateway. PS does **not**
 * write PMDB and does **not** import any PM Central private file —
 * it goes through the platform handoff manager and the gateway
 * public-api surface only.
 *
 * Boundary rule: PS = Decision, PM Central = Execution.
 * After successful handoff, PS classification is locked
 * (status = SENT_TO_PM) and `pmProjectId` points at the new
 * PM Central `pm_projects` row (NOT at the legacy `pmt_projects`).
 */

import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb } from "../db/connection";
import { psProjects } from "../../drizzle/tables/ps";
import { logPsAudit } from "./ps.audit";
import { sendToPMCentral } from "./ps.lifecycle";
import { submitHandoff } from "../platform/handoff";
import { gatewayCall } from "../platform/modules/module-gateway";

const PM_HANDOFF_TYPE = "pmCentral.project.convertFromPS";

interface PmProjectListEntry {
  id: number;
  name: string;
  workspaceId: number;
  sourceModule: string | null;
  sourceRefId: number | null;
  status: string;
}

/**
 * Create a PM Central project from a validated PS project.
 *
 * 1. Validates PS project status = VALIDATED
 * 2. Submits PS → PM Central handoff (`pmCentral.project.convertFromPS`)
 *    via the platform handoff manager. The acceptor (registered by PM
 *    Central) records the handoff in `pm_handoffs` and converts it
 *    into a `pm_projects` row inside pmdb.
 * 3. Looks up the resulting `pm_projects` row through the Module
 *    Gateway (`pmCentral.projects.list` filtered by source attribution).
 * 4. Transitions PS project: VALIDATED → SENT_TO_PM and links
 *    `pmProjectId` to the new PM Central project id.
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

  // 2. Submit handoff. The PM Central handoff acceptor records it in
  //    pm_handoffs and converts it to a pm_projects row. PS performs
  //    no writes against pmdb.
  const handoffPayload = {
    workspaceId,
    sourceModule: "ps" as const,
    sourceProjectId: psProjectId,
    sourceWizardRunId: psProject.wizardRunId ?? undefined,
    name: psProject.name,
    scenario: psProject.scenario ?? undefined,
    selectedScopeCode: psProject.selectedScopeCode ?? undefined,
    confidence: psProject.confidence ?? undefined,
    context: {
      psMatrixVersionId: psProject.matrixVersionId,
      origin: "ps_bridge",
    },
  };
  const handoff = await submitHandoff({
    fromModule: "ps",
    toModule: "pmCentral",
    type: PM_HANDOFF_TYPE,
    payload: handoffPayload as Record<string, unknown>,
    actorId,
    workspaceId,
  });
  if (handoff.status !== "accepted") {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `PS → PM handoff was not accepted (status=${handoff.status}, reason=${handoff.failureReason ?? "unknown"})`,
    });
  }

  // 3. Resolve the resulting pm_projects row via the Module Gateway.
  //    No direct PM Central imports — only the public action surface.
  const matches = (await gatewayCall<unknown, PmProjectListEntry[]>({
    ctx: {
      sourceModule: "ps",
      targetModule: "pmCentral",
      actionKey: "pmCentral.project.list",
      workspaceId,
      actorId,
    },
    input: {
      workspaceId,
      sourceModule: "ps",
      sourceRefId: psProjectId,
      limit: 1,
    },
  })) ?? [];
  const pmProject = matches[0];
  if (!pmProject) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `PS → PM handoff was accepted but the resulting pm_projects row could not be located for ps#${psProjectId}.`,
    });
  }

  // 4. Link the new PM Central project id back onto the PS row.
  await db
    .update(psProjects)
    .set({ pmProjectId: pmProject.id })
    .where(eq(psProjects.id, psProjectId));

  // 5. Lifecycle transition: VALIDATED → SENT_TO_PM
  const locked = await sendToPMCentral(psProjectId, actorId);

  // 6. PS-side audit
  await logPsAudit({
    actorId,
    action: "bridge.send_to_pm",
    entityType: "ps_project",
    entityId: psProjectId,
    newValue: {
      pmProjectId: pmProject.id,
      pmProjectName: pmProject.name,
      pmHandoffId: handoff.handoffId,
      lockedScopeCode: psProject.selectedScopeCode,
    },
  });

  return { pmProject, psProject: locked };
}
