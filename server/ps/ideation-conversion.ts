/**
 * PS Ideation — Conversion Service
 *
 * Builds concept package and manages the ideation → wizard → project lifecycle.
 */

import { TRPCError } from "@trpc/server";
import { getDb } from "../db/connection";
import { eq } from "drizzle-orm";
import { psIdeations, psIdeationIdeas } from "../../drizzle/tables/ps";
import { evaluateReadiness } from "./ideation-readiness";
import { composeSummary } from "./summary-composer";
import { emitIdeationEvent } from "./ideation-audit";
import { logPsAudit } from "./ps.audit";
import type { ConceptPackage } from "./ps.ideation-types";

function requireDb() {
  const db = getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

/**
 * Build the concept package for PS Wizard prefill.
 * Requires readiness pass.
 */
export async function prepareConceptPackage(
  ideationId: number,
  actorId: number,
): Promise<ConceptPackage> {
  const db = requireDb();

  const [ideation] = await db.select().from(psIdeations).where(eq(psIdeations.id, ideationId));
  if (!ideation) throw new TRPCError({ code: "NOT_FOUND", message: "Ideation not found" });

  // Readiness gate
  const readiness = await evaluateReadiness(ideation);
  if (!readiness.ready) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Ideation not ready for wizard: ${readiness.blockers.join("; ")}`,
    });
  }

  // Get selected idea
  const ideas = await db.select().from(psIdeationIdeas)
    .where(eq(psIdeationIdeas.ideationId, ideationId));
  const selected = ideas.find(i => i.isSelected === 1);
  if (!selected) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No concept selected" });
  }

  // Auto-generate summary if not already present
  let summaryText = ideation.summaryOverrideText || ideation.summaryGeneratedText;
  if (!summaryText) {
    summaryText = await composeSummary(ideation);
    await db.update(psIdeations).set({
      summaryGeneratedText: summaryText,
      updatedAt: new Date(),
    }).where(eq(psIdeations.id, ideationId));
  }

  // Build scenario text from problem + opportunity + selected concept
  const scenarioText = [
    ideation.problemStatementSnapshot,
    ideation.opportunityStatementSnapshot,
    selected.title,
    selected.description,
  ].filter(Boolean).join("\n\n");

  const pkg: ConceptPackage = {
    ideationId: ideation.id,
    workspaceId: ideation.workspaceId,
    title: ideation.title,
    scenarioText,
    systemName: selected.title || ideation.title,
    problemStatement: ideation.problemStatementSnapshot || "",
    opportunityStatement: ideation.opportunityStatementSnapshot || "",
    selectedConcept: selected.title,
    rationale: ideation.rationaleSummary || "",
    feasibilityScore: ideation.feasibilityScore,
    riskLevel: ideation.riskLevel,
    scopeDraft: null,
    suggestedMethod: null,
    classificationHints: {},
  };

  await emitIdeationEvent({
    ideationId,
    eventType: "conversion.package_prepared",
    payload: { selectedConcept: selected.title },
    actorId,
  });

  return pkg;
}

/**
 * Commit the conversion after successful wizard/project creation.
 * Freezes the ideation record.
 */
export async function commitConversion(
  ideationId: number,
  createdProjectId?: number,
  createdSystemId?: number,
  actorId?: number,
) {
  const db = requireDb();

  const [ideation] = await db.select().from(psIdeations).where(eq(psIdeations.id, ideationId));
  if (!ideation) throw new TRPCError({ code: "NOT_FOUND", message: "Ideation not found" });

  // Prevent double conversion
  if (ideation.lifecycleStatus === "converted") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Ideation already converted" });
  }

  // Readiness check again
  const readiness = await evaluateReadiness(ideation);
  if (!readiness.ready) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot commit: ${readiness.blockers.join("; ")}`,
    });
  }

  const [updated] = await db.update(psIdeations).set({
    lifecycleStatus: "converted",
    conversionProjectId: createdProjectId || createdSystemId || null,
    convertedAt: new Date(),
    updatedBy: actorId ?? null,
    updatedAt: new Date(),
  }).where(eq(psIdeations.id, ideationId)).returning();

  await emitIdeationEvent({
    ideationId,
    eventType: "conversion.committed",
    payload: { createdProjectId, createdSystemId },
    actorId,
  });

  await logPsAudit({
    actorId,
    action: "ideation.converted",
    entityType: "ps_ideation",
    entityId: ideationId,
    newValue: { createdProjectId, createdSystemId },
  });

  return updated;
}
