/**
 * PS Ideation — Summary Composer
 *
 * Auto-generates the one-page summary from structured step data.
 */

import { getDb } from "../db/connection";
import { eq, and } from "drizzle-orm";
import {
  psIdeationSteps,
  psIdeationIdeas,
  psIdeationScenarios,
  psIdeationFeasibilityChecks,
  type PsIdeation,
} from "../../drizzle/tables/ps";

export async function composeSummary(ideation: PsIdeation): Promise<string> {
  const db = getDb();
  if (!db) return "";

  const sections: string[] = [];

  // The Problem
  const problemStep = await db.select().from(psIdeationSteps)
    .where(and(eq(psIdeationSteps.ideationId, ideation.id), eq(psIdeationSteps.stepKey, "problem")))
    .then(r => r[0]);
  if (problemStep?.payloadJson) {
    const p = problemStep.payloadJson as Record<string, string>;
    sections.push(`## The Problem\n${p.whatIsNotWorking || ""}\nImpacted: ${p.whoIsImpacted || ""}\nConsequences: ${p.consequencesOfDoingNothing || ""}`);
  }

  // The Opportunity
  const oppStep = await db.select().from(psIdeationSteps)
    .where(and(eq(psIdeationSteps.ideationId, ideation.id), eq(psIdeationSteps.stepKey, "opportunity")))
    .then(r => r[0]);
  if (oppStep?.payloadJson) {
    const o = oppStep.payloadJson as Record<string, string>;
    sections.push(`## The Opportunity\n${o.whatCouldBeImproved || ""}\nValue: ${o.whatValueCouldBeCreated || ""}\nAdvantage: ${o.strategicAdvantage || ""}`);
  }

  // Top ideas
  const ideas = await db.select().from(psIdeationIdeas)
    .where(eq(psIdeationIdeas.ideationId, ideation.id));
  if (ideas.length > 0) {
    const topIdeas = ideas.slice(0, 5).map((i, idx) => `${idx + 1}. ${i.title}`).join("\n");
    sections.push(`## Top Ideas Generated\n${topIdeas}`);
  }

  // Scenarios explored
  const scenarios = await db.select().from(psIdeationScenarios)
    .where(eq(psIdeationScenarios.ideationId, ideation.id));
  if (scenarios.length > 0) {
    const scenarioSummary = scenarios.map(s => {
      const idea = ideas.find(i => i.id === s.ideaId);
      return `- ${idea?.title || "Idea"}: ${s.insightsText || "No insights recorded"}`;
    }).join("\n");
    sections.push(`## Scenarios Explored\n${scenarioSummary}`);
  }

  // Feasibility insights
  const checks = await db.select().from(psIdeationFeasibilityChecks)
    .where(eq(psIdeationFeasibilityChecks.ideationId, ideation.id));
  if (checks.length > 0) {
    const feasSummary = checks.map(c => {
      const idea = ideas.find(i => i.id === c.ideaId);
      return `- ${idea?.title || "Idea"}: ${c.feasibilityRating} — ${c.testPerformed}`;
    }).join("\n");
    sections.push(`## Feasibility Insights\n${feasSummary}`);
  }

  // Selected concept
  const selected = ideas.find(i => i.isSelected === 1);
  if (selected) {
    sections.push(`## Selected Concept\n${selected.title}\n${selected.description || ""}`);
  }

  // Reason for selection
  if (ideation.rationaleSummary) {
    sections.push(`## Reason for Selection\n${ideation.rationaleSummary}`);
  }

  return sections.join("\n\n");
}
