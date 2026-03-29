/**
 * PS Ideation — Service Layer
 *
 * Core CRUD, child entity management, and denormalized snapshot operations.
 */

import { TRPCError } from "@trpc/server";
import { getDb } from "../db/connection";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  psIdeations,
  psIdeationSteps,
  psIdeationIdeas,
  psIdeationThemes,
  psIdeationScreeningScores,
  psIdeationScenarios,
  psIdeationFeasibilityChecks,
  psIdeationActivity,
} from "../../drizzle/tables/ps";
import { psIdeationTranslatorRuns } from "../../drizzle/tables/ps-translator";
import { IDEATION_STEP_KEYS, type IdeationStepKey, type IdeationLifecycleStatus } from "./ps.ideation-types";
import { emitIdeationEvent } from "./ideation-audit";
import { logPsAudit } from "./ps.audit";

// ── Helpers ───────────────────────────────────────────────────────────

function requireDb() {
  const db = getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

// ── Ideation CRUD ─────────────────────────────────────────────────────

export async function createIdeation(input: {
  workspaceId: number;
  title: string;
  sourceType?: string;
}, actorId: number) {
  const db = requireDb();

  const [ideation] = await db.insert(psIdeations).values({
    workspaceId: input.workspaceId,
    title: input.title.trim(),
    sourceType: input.sourceType || "manual",
    lifecycleStatus: "draft",
    currentStepKey: "context",
    createdBy: actorId,
    updatedBy: actorId,
  }).returning();

  // Initialize all 11 steps
  const stepRows = IDEATION_STEP_KEYS.map((key, i) => ({
    ideationId: ideation.id,
    stepKey: key,
    stepOrder: i + 1,
    stepStatus: i === 0 ? "in_progress" : "not_started",
  }));
  await db.insert(psIdeationSteps).values(stepRows);

  await emitIdeationEvent({
    ideationId: ideation.id,
    eventType: "ideation.created",
    payload: { title: ideation.title, sourceType: ideation.sourceType },
    actorId,
  });

  await logPsAudit({
    actorId,
    action: "ideation.create",
    entityType: "ps_ideation",
    entityId: ideation.id,
    newValue: { title: ideation.title, workspaceId: input.workspaceId },
  });

  return ideation;
}

export async function getIdeationById(id: number) {
  const db = requireDb();
  const [ideation] = await db.select().from(psIdeations).where(eq(psIdeations.id, id));
  if (!ideation) throw new TRPCError({ code: "NOT_FOUND", message: "Ideation not found" });
  return ideation;
}

export async function listIdeations(workspaceId: number) {
  const db = requireDb();
  return db.select().from(psIdeations)
    .where(eq(psIdeations.workspaceId, workspaceId))
    .orderBy(desc(psIdeations.createdAt));
}

export async function updateIdeationMeta(id: number, data: {
  title?: string;
  riskLevel?: string;
}, actorId: number) {
  const db = requireDb();
  const ideation = await getIdeationById(id);
  guardConverted(ideation);

  const updateData: Record<string, any> = { updatedBy: actorId, updatedAt: new Date() };
  if (data.title !== undefined) updateData.title = data.title.trim();
  if (data.riskLevel !== undefined) updateData.riskLevel = data.riskLevel;

  const [updated] = await db.update(psIdeations).set(updateData).where(eq(psIdeations.id, id)).returning();

  await emitIdeationEvent({
    ideationId: id,
    eventType: "ideation.meta_updated",
    payload: data,
    actorId,
  });

  return updated;
}

export async function duplicateIdeation(
  id: number,
  actorId: number,
  options?: { carryPayloads?: boolean; preserveLifecycle?: boolean },
) {
  const db = requireDb();
  const source = await getIdeationById(id);
  const carry = options?.carryPayloads ?? false;
  const preserve = options?.preserveLifecycle ?? false;

  // Read source steps for payload carry-over
  const sourceSteps = carry
    ? await db.select().from(psIdeationSteps)
        .where(eq(psIdeationSteps.ideationId, id))
        .orderBy(psIdeationSteps.stepOrder)
    : [];
  const sourceStepMap = new Map(sourceSteps.map((s) => [s.stepKey, s]));

  // Lifecycle: preserve source's state or reset to draft
  const lifecycleStatus = preserve ? source.lifecycleStatus : "draft";
  const currentStepKey = preserve ? source.currentStepKey : "context";

  const [copy] = await db.insert(psIdeations).values({
    workspaceId: source.workspaceId,
    title: `${source.title} (Copy)`,
    sourceType: source.sourceType,
    lifecycleStatus,
    currentStepKey,
    // Carry over snapshots when preserving
    ...(preserve ? {
      problemStatementSnapshot: source.problemStatementSnapshot,
      opportunityStatementSnapshot: source.opportunityStatementSnapshot,
      guidingQuestionSnapshot: source.guidingQuestionSnapshot,
      rationaleSummary: source.rationaleSummary,
    } : {}),
    createdBy: actorId,
    updatedBy: actorId,
  }).returning();

  // Build steps — carry payloads/status from source when requested
  const stepRows = IDEATION_STEP_KEYS.map((key, i) => {
    const srcStep = sourceStepMap.get(key);
    const hasPayload = carry && srcStep?.payloadJson;
    return {
      ideationId: copy.id,
      stepKey: key,
      stepOrder: i + 1,
      stepStatus: hasPayload && srcStep.stepStatus === "complete"
        ? "complete"
        : i === 0 ? "in_progress" : "not_started",
      ...(hasPayload ? { payloadJson: srcStep.payloadJson } : {}),
    };
  });
  await db.insert(psIdeationSteps).values(stepRows);

  await emitIdeationEvent({
    ideationId: copy.id,
    eventType: "ideation.duplicated",
    payload: {
      sourceIdeationId: id,
      title: copy.title,
      carryPayloads: carry,
      preserveLifecycle: preserve,
    },
    actorId,
  });

  await logPsAudit({
    actorId,
    action: "ideation.duplicate",
    entityType: "ps_ideation",
    entityId: copy.id,
    previousValue: { sourceId: id },
    newValue: { title: copy.title, workspaceId: source.workspaceId },
  });

  return copy;
}

export async function deleteIdeationDraft(id: number, actorId: number) {
  const db = requireDb();
  const ideation = await getIdeationById(id);
  if (ideation.lifecycleStatus === "converted") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Converted ideations cannot be deleted" });
  }

  // Cascade delete child entities (order: deepest children first)
  // Translator runs table may not exist if migration hasn't run yet
  try {
    await db.delete(psIdeationTranslatorRuns).where(eq(psIdeationTranslatorRuns.ideationId, id));
  } catch { /* table may not exist yet */ }
  await db.delete(psIdeationActivity).where(eq(psIdeationActivity.ideationId, id));
  await db.delete(psIdeationFeasibilityChecks).where(eq(psIdeationFeasibilityChecks.ideationId, id));
  await db.delete(psIdeationScenarios).where(eq(psIdeationScenarios.ideationId, id));
  await db.delete(psIdeationScreeningScores).where(eq(psIdeationScreeningScores.ideationId, id));
  await db.delete(psIdeationIdeas).where(eq(psIdeationIdeas.ideationId, id));
  await db.delete(psIdeationThemes).where(eq(psIdeationThemes.ideationId, id));
  await db.delete(psIdeationSteps).where(eq(psIdeationSteps.ideationId, id));
  await db.delete(psIdeations).where(eq(psIdeations.id, id));

  await logPsAudit({
    actorId,
    action: "ideation.delete_draft",
    entityType: "ps_ideation",
    entityId: id,
  });

  return { success: true };
}

export async function setLifecycleStatus(
  id: number,
  status: IdeationLifecycleStatus,
  actorId: number,
) {
  const db = requireDb();
  const ideation = await getIdeationById(id);
  guardConverted(ideation);

  const updateData: Record<string, any> = {
    lifecycleStatus: status,
    updatedBy: actorId,
    updatedAt: new Date(),
  };

  if (status === "ready_for_wizard") {
    updateData.readyAt = new Date();
  }

  const [updated] = await db.update(psIdeations).set(updateData).where(eq(psIdeations.id, id)).returning();

  await emitIdeationEvent({
    ideationId: id,
    eventType: "ideation.lifecycle_changed",
    payload: { from: ideation.lifecycleStatus, to: status },
    actorId,
  });

  await logPsAudit({
    actorId,
    action: "ideation.lifecycle_change",
    entityType: "ps_ideation",
    entityId: id,
    previousValue: { status: ideation.lifecycleStatus },
    newValue: { status },
  });

  return updated;
}

export async function setCurrentStep(id: number, stepKey: IdeationStepKey, actorId: number) {
  const db = requireDb();
  const ideation = await getIdeationById(id);
  guardConverted(ideation);

  const [updated] = await db.update(psIdeations).set({
    currentStepKey: stepKey,
    updatedBy: actorId,
    updatedAt: new Date(),
  }).where(eq(psIdeations.id, id)).returning();

  return updated;
}

// ── Step Operations ───────────────────────────────────────────────────

export async function getStep(ideationId: number, stepKey: string) {
  const db = requireDb();
  const [step] = await db.select().from(psIdeationSteps)
    .where(and(eq(psIdeationSteps.ideationId, ideationId), eq(psIdeationSteps.stepKey, stepKey)));
  return step || null;
}

export async function getSteps(ideationId: number) {
  const db = requireDb();
  return db.select().from(psIdeationSteps)
    .where(eq(psIdeationSteps.ideationId, ideationId))
    .orderBy(psIdeationSteps.stepOrder);
}

export async function saveStepPayload(
  ideationId: number,
  stepKey: string,
  payload: Record<string, unknown>,
  actorId: number,
) {
  const db = requireDb();
  const ideation = await getIdeationById(ideationId);
  guardConverted(ideation);

  const now = new Date();
  const [updated] = await db.update(psIdeationSteps).set({
    payloadJson: payload,
    stepStatus: "complete",
    lastSavedAt: now,
    completedAt: now,
  }).where(
    and(eq(psIdeationSteps.ideationId, ideationId), eq(psIdeationSteps.stepKey, stepKey))
  ).returning();

  if (!updated) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Step ${stepKey} not found` });
  }

  // Update denormalized snapshots on the parent
  await updateSnapshots(ideationId, stepKey, payload, actorId);

  // Auto-progress lifecycle
  await autoProgressLifecycle(ideationId, stepKey as IdeationStepKey);

  await emitIdeationEvent({
    ideationId,
    eventType: "step.saved",
    payload: { stepKey },
    actorId,
  });

  return updated;
}

// ── Ideas ─────────────────────────────────────────────────────────────

export async function addIdea(input: {
  ideationId: number;
  title: string;
  description?: string;
  sourceType?: string;
}, actorId: number) {
  const db = requireDb();
  const ideation = await getIdeationById(input.ideationId);
  guardConverted(ideation);

  const [idea] = await db.insert(psIdeationIdeas).values({
    ideationId: input.ideationId,
    title: input.title.trim(),
    description: input.description || null,
    sourceType: input.sourceType || "brainstorm",
  }).returning();

  await emitIdeationEvent({
    ideationId: input.ideationId,
    eventType: "idea.added",
    payload: { ideaId: idea.id, title: idea.title },
    actorId,
  });

  return idea;
}

export async function updateIdea(input: {
  id: number;
  title?: string;
  description?: string;
  themeId?: number | null;
  rankOrder?: number;
  isShortlisted?: number;
}, actorId: number) {
  const db = requireDb();

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (input.title !== undefined) updateData.title = input.title.trim();
  if (input.description !== undefined) updateData.description = input.description;
  if (input.themeId !== undefined) updateData.themeId = input.themeId;
  if (input.rankOrder !== undefined) updateData.rankOrder = input.rankOrder;
  if (input.isShortlisted !== undefined) updateData.isShortlisted = input.isShortlisted;

  const [updated] = await db.update(psIdeationIdeas)
    .set(updateData)
    .where(eq(psIdeationIdeas.id, input.id))
    .returning();

  if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Idea not found" });
  return updated;
}

export async function removeIdea(id: number, actorId: number) {
  const db = requireDb();

  // Cascade: remove screening, scenarios, feasibility for this idea
  await db.delete(psIdeationScreeningScores).where(eq(psIdeationScreeningScores.ideaId, id));
  await db.delete(psIdeationScenarios).where(eq(psIdeationScenarios.ideaId, id));
  await db.delete(psIdeationFeasibilityChecks).where(eq(psIdeationFeasibilityChecks.ideaId, id));

  const [deleted] = await db.delete(psIdeationIdeas).where(eq(psIdeationIdeas.id, id)).returning();
  if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Idea not found" });
  return { success: true };
}

export async function selectIdea(ideationId: number, ideaId: number, actorId: number) {
  const db = requireDb();
  const ideation = await getIdeationById(ideationId);
  guardConverted(ideation);

  // Deselect all first
  await db.update(psIdeationIdeas)
    .set({ isSelected: 0, updatedAt: new Date() })
    .where(eq(psIdeationIdeas.ideationId, ideationId));

  // Select the one
  const [selected] = await db.update(psIdeationIdeas)
    .set({ isSelected: 1, updatedAt: new Date() })
    .where(and(eq(psIdeationIdeas.id, ideaId), eq(psIdeationIdeas.ideationId, ideationId)))
    .returning();

  if (!selected) throw new TRPCError({ code: "NOT_FOUND", message: "Idea not found in this ideation" });

  // Update parent snapshot
  await db.update(psIdeations).set({
    selectedIdeaId: ideaId,
    selectedConceptSummary: selected.title,
    updatedBy: actorId,
    updatedAt: new Date(),
  }).where(eq(psIdeations.id, ideationId));

  await emitIdeationEvent({
    ideationId,
    eventType: "idea.selected",
    payload: { ideaId, title: selected.title },
    actorId,
  });

  return selected;
}

export async function listIdeas(ideationId: number) {
  const db = requireDb();
  return db.select().from(psIdeationIdeas)
    .where(eq(psIdeationIdeas.ideationId, ideationId))
    .orderBy(psIdeationIdeas.rankOrder);
}

// ── Themes ────────────────────────────────────────────────────────────

export async function upsertTheme(input: {
  id?: number;
  ideationId: number;
  label: string;
  patternNotes?: string;
  sortOrder?: number;
}, actorId: number) {
  const db = requireDb();

  if (input.id) {
    const [updated] = await db.update(psIdeationThemes).set({
      label: input.label.trim(),
      patternNotes: input.patternNotes || null,
      sortOrder: input.sortOrder ?? 0,
    }).where(eq(psIdeationThemes.id, input.id)).returning();
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Theme not found" });
    return updated;
  }

  const [created] = await db.insert(psIdeationThemes).values({
    ideationId: input.ideationId,
    label: input.label.trim(),
    patternNotes: input.patternNotes || null,
    sortOrder: input.sortOrder ?? 0,
  }).returning();
  return created;
}

export async function removeTheme(id: number) {
  const db = requireDb();
  // Un-assign ideas from this theme
  await db.update(psIdeationIdeas).set({ themeId: null }).where(eq(psIdeationIdeas.themeId, id));
  const [deleted] = await db.delete(psIdeationThemes).where(eq(psIdeationThemes.id, id)).returning();
  if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Theme not found" });
  return { success: true };
}

export async function listThemes(ideationId: number) {
  const db = requireDb();
  return db.select().from(psIdeationThemes)
    .where(eq(psIdeationThemes.ideationId, ideationId))
    .orderBy(psIdeationThemes.sortOrder);
}

// ── Screening ─────────────────────────────────────────────────────────

export async function saveScreeningScore(input: {
  ideationId: number;
  ideaId: number;
  criterionKey: string;
  score: number;
  note?: string;
}, actorId: number) {
  const db = requireDb();

  // Upsert
  const existing = await db.select().from(psIdeationScreeningScores)
    .where(and(
      eq(psIdeationScreeningScores.ideationId, input.ideationId),
      eq(psIdeationScreeningScores.ideaId, input.ideaId),
      eq(psIdeationScreeningScores.criterionKey, input.criterionKey),
    )).then(r => r[0]);

  if (existing) {
    const [updated] = await db.update(psIdeationScreeningScores).set({
      score: input.score,
      note: input.note || null,
      scoredBy: actorId,
      updatedAt: new Date(),
    }).where(eq(psIdeationScreeningScores.id, existing.id)).returning();
    return updated;
  }

  const [created] = await db.insert(psIdeationScreeningScores).values({
    ideationId: input.ideationId,
    ideaId: input.ideaId,
    criterionKey: input.criterionKey,
    score: input.score,
    note: input.note || null,
    scoredBy: actorId,
  }).returning();
  return created;
}

export async function listScreeningScores(ideationId: number) {
  const db = requireDb();
  return db.select().from(psIdeationScreeningScores)
    .where(eq(psIdeationScreeningScores.ideationId, ideationId));
}

// ── Scenarios ─────────────────────────────────────────────────────────

export async function upsertScenario(input: {
  id?: number;
  ideationId: number;
  ideaId: number;
  adoptionHighText?: string;
  adoptionLowText?: string;
  costIncreaseText?: string;
  competitorReactionText?: string;
  technologyLimitText?: string;
  insightsText?: string;
}, actorId: number) {
  const db = requireDb();

  if (input.id) {
    const [updated] = await db.update(psIdeationScenarios).set({
      adoptionHighText: input.adoptionHighText || null,
      adoptionLowText: input.adoptionLowText || null,
      costIncreaseText: input.costIncreaseText || null,
      competitorReactionText: input.competitorReactionText || null,
      technologyLimitText: input.technologyLimitText || null,
      insightsText: input.insightsText || null,
      updatedBy: actorId,
      updatedAt: new Date(),
    }).where(eq(psIdeationScenarios.id, input.id)).returning();
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Scenario not found" });
    return updated;
  }

  const [created] = await db.insert(psIdeationScenarios).values({
    ideationId: input.ideationId,
    ideaId: input.ideaId,
    adoptionHighText: input.adoptionHighText || null,
    adoptionLowText: input.adoptionLowText || null,
    costIncreaseText: input.costIncreaseText || null,
    competitorReactionText: input.competitorReactionText || null,
    technologyLimitText: input.technologyLimitText || null,
    insightsText: input.insightsText || null,
    createdBy: actorId,
    updatedBy: actorId,
  }).returning();
  return created;
}

export async function listScenarios(ideationId: number) {
  const db = requireDb();
  return db.select().from(psIdeationScenarios)
    .where(eq(psIdeationScenarios.ideationId, ideationId));
}

// ── Feasibility ───────────────────────────────────────────────────────

export async function upsertFeasibility(input: {
  id?: number;
  ideationId: number;
  ideaId: number;
  testPerformed: string;
  finding1?: string;
  finding2?: string;
  feasibilityRating: string;
  confidence?: string;
  evidenceRef?: string;
  notes?: string;
}, actorId: number) {
  const db = requireDb();

  if (input.id) {
    const [updated] = await db.update(psIdeationFeasibilityChecks).set({
      testPerformed: input.testPerformed,
      finding1: input.finding1 || null,
      finding2: input.finding2 || null,
      feasibilityRating: input.feasibilityRating,
      confidence: input.confidence || null,
      evidenceRef: input.evidenceRef || null,
      notes: input.notes || null,
      updatedBy: actorId,
      updatedAt: new Date(),
    }).where(eq(psIdeationFeasibilityChecks.id, input.id)).returning();
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Feasibility check not found" });
    return updated;
  }

  const [created] = await db.insert(psIdeationFeasibilityChecks).values({
    ideationId: input.ideationId,
    ideaId: input.ideaId,
    testPerformed: input.testPerformed,
    finding1: input.finding1 || null,
    finding2: input.finding2 || null,
    feasibilityRating: input.feasibilityRating,
    confidence: input.confidence || null,
    evidenceRef: input.evidenceRef || null,
    notes: input.notes || null,
    createdBy: actorId,
    updatedBy: actorId,
  }).returning();
  return created;
}

export async function listFeasibilityChecks(ideationId: number) {
  const db = requireDb();
  return db.select().from(psIdeationFeasibilityChecks)
    .where(eq(psIdeationFeasibilityChecks.ideationId, ideationId));
}

// ── Activity ──────────────────────────────────────────────────────────

export async function listActivity(ideationId: number) {
  const db = requireDb();
  return db.select().from(psIdeationActivity)
    .where(eq(psIdeationActivity.ideationId, ideationId))
    .orderBy(desc(psIdeationActivity.createdAt))
    .limit(50);
}

// ── Monitoring KPIs ───────────────────────────────────────────────────

export async function getIdeationKPIs() {
  const db = requireDb();

  const all = await db.select().from(psIdeations);
  const total = all.length;
  const byStatus: Record<string, number> = {};
  let readyCount = 0;
  let convertedCount = 0;
  let deferredCount = 0;
  let rejectedCount = 0;

  for (const i of all) {
    byStatus[i.lifecycleStatus] = (byStatus[i.lifecycleStatus] || 0) + 1;
    if (i.lifecycleStatus === "ready_for_wizard") readyCount++;
    if (i.lifecycleStatus === "converted") convertedCount++;
    if (i.lifecycleStatus === "deferred") deferredCount++;
    if (i.lifecycleStatus === "rejected") rejectedCount++;
  }

  const conversionRate = total > 0 ? convertedCount / total : 0;

  return {
    total,
    byStatus,
    readyForWizardCount: readyCount,
    convertedCount,
    conversionRate,
    deferredCount,
    rejectedCount,
  };
}

// ── Internal Helpers ──────────────────────────────────────────────────

function guardConverted(ideation: { lifecycleStatus: string }) {
  if (ideation.lifecycleStatus === "converted") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Converted ideation records cannot be edited" });
  }
}

async function updateSnapshots(
  ideationId: number,
  stepKey: string,
  payload: Record<string, unknown>,
  actorId: number,
) {
  const db = requireDb();
  const updates: Record<string, any> = { updatedBy: actorId, updatedAt: new Date() };

  if (stepKey === "problem") {
    const p = payload as { whatIsNotWorking?: string; whoIsImpacted?: string; consequencesOfDoingNothing?: string };
    updates.problemStatementSnapshot = [p.whatIsNotWorking, p.whoIsImpacted, p.consequencesOfDoingNothing].filter(Boolean).join(" | ");
  } else if (stepKey === "opportunity") {
    const o = payload as { whatCouldBeImproved?: string; whatValueCouldBeCreated?: string; strategicAdvantage?: string };
    updates.opportunityStatementSnapshot = [o.whatCouldBeImproved, o.whatValueCouldBeCreated, o.strategicAdvantage].filter(Boolean).join(" | ");
  } else if (stepKey === "guiding_question") {
    updates.guidingQuestionSnapshot = (payload as { whatIf?: string }).whatIf || null;
  } else if (stepKey === "concept_selection") {
    const cs = payload as { selectedIdeaId?: number; rationale?: Record<string, string>; nextStep?: string };
    if (cs.rationale) {
      updates.rationaleSummary = Object.values(cs.rationale).filter(Boolean).join(" | ");
    }
  }

  if (Object.keys(updates).length > 2) {
    await db.update(psIdeations).set(updates).where(eq(psIdeations.id, ideationId));
  }
}

async function autoProgressLifecycle(ideationId: number, stepKey: IdeationStepKey) {
  const db = requireDb();
  const [ideation] = await db.select().from(psIdeations).where(eq(psIdeations.id, ideationId));
  if (!ideation) return;

  // Only auto-progress forward, never backward
  const INTAKE_STEPS: IdeationStepKey[] = ["context", "problem", "opportunity", "guiding_question"];
  const EXPLORATION_STEPS: IdeationStepKey[] = ["idea_generation", "clustering"];
  const SCREENING_STEPS: IdeationStepKey[] = ["screening"];
  const SELECTION_STEPS: IdeationStepKey[] = ["concept_selection"];

  let newStatus: IdeationLifecycleStatus | null = null;

  if (ideation.lifecycleStatus === "draft" && INTAKE_STEPS.includes(stepKey)) {
    newStatus = "in_exploration";
  } else if (ideation.lifecycleStatus === "in_exploration" && SCREENING_STEPS.includes(stepKey)) {
    newStatus = "screening";
  } else if (
    (ideation.lifecycleStatus === "in_exploration" || ideation.lifecycleStatus === "screening")
    && SELECTION_STEPS.includes(stepKey)
  ) {
    newStatus = "concept_selected";
  }

  if (newStatus && newStatus !== ideation.lifecycleStatus) {
    await db.update(psIdeations).set({
      lifecycleStatus: newStatus,
      updatedAt: new Date(),
    }).where(eq(psIdeations.id, ideationId));
  }
}
