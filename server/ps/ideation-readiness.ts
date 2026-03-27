/**
 * PS Ideation — Readiness Engine
 *
 * Evaluates whether an ideation record is ready for PS Wizard handoff.
 */

import { getDb } from "../db/connection";
import { eq, and } from "drizzle-orm";
import {
  psIdeationSteps,
  psIdeationIdeas,
  psIdeationScreeningScores,
  psIdeationFeasibilityChecks,
} from "../../drizzle/tables/ps";
import type { ReadinessResult } from "./ps.ideation-types";
import type { PsIdeation } from "../../drizzle/tables/ps";

export async function evaluateReadiness(ideation: PsIdeation): Promise<ReadinessResult> {
  const db = getDb();
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!db) {
    return { ready: false, blockers: ["Database unavailable"], warnings: [] };
  }

  // 1. Check Problem step is complete
  const problemStep = await db.select().from(psIdeationSteps)
    .where(and(eq(psIdeationSteps.ideationId, ideation.id), eq(psIdeationSteps.stepKey, "problem")))
    .then(r => r[0]);
  if (!problemStep || problemStep.stepStatus !== "complete") {
    blockers.push("Problem definition not complete");
  }

  // 2. Check Opportunity step is complete
  const oppStep = await db.select().from(psIdeationSteps)
    .where(and(eq(psIdeationSteps.ideationId, ideation.id), eq(psIdeationSteps.stepKey, "opportunity")))
    .then(r => r[0]);
  if (!oppStep || oppStep.stepStatus !== "complete") {
    blockers.push("Opportunity definition not complete");
  }

  // 3. At least one idea exists
  const ideas = await db.select().from(psIdeationIdeas)
    .where(eq(psIdeationIdeas.ideationId, ideation.id));
  if (ideas.length === 0) {
    blockers.push("No ideas created");
  }

  // 4. Exactly one idea selected
  const selectedIdeas = ideas.filter(i => i.isSelected === 1);
  if (selectedIdeas.length === 0) {
    blockers.push("No concept selected");
  } else if (selectedIdeas.length > 1) {
    blockers.push("Multiple concepts selected — exactly one required");
  }

  // 5. Concept rationale present
  if (!ideation.rationaleSummary && !ideation.selectedConceptSummary) {
    blockers.push("Concept rationale not provided");
  }

  // Warning-only gaps
  const screeningScores = await db.select().from(psIdeationScreeningScores)
    .where(eq(psIdeationScreeningScores.ideationId, ideation.id));
  if (screeningScores.length === 0) {
    warnings.push("No screening scores saved");
  }

  const feasibilityChecks = await db.select().from(psIdeationFeasibilityChecks)
    .where(eq(psIdeationFeasibilityChecks.ideationId, ideation.id));
  if (feasibilityChecks.length === 0) {
    warnings.push("No feasibility checks saved");
  }

  if (!ideation.summaryGeneratedText && !ideation.summaryOverrideText) {
    warnings.push("No one-page summary generated or overridden");
  }

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
  };
}
