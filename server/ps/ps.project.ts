/**
 * PS Projects — Formal project artifacts produced by the PS Wizard.
 *
 * A PS Project captures the full decision trace from the wizard:
 * scenario, context, classification result, selected scope, and
 * template bundle. Status starts as DRAFT.
 */

import { TRPCError } from "@trpc/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "../db/connection";
import { psProjects, psWizardRuns } from "../../drizzle/tables/ps";
import { logPsAudit } from "./ps.audit";
import { resolveTemplateBundle } from "./ps.templates";
import type { PsProject } from "../../drizzle/tables/ps";

// ── Unique name resolution ─────────────────────────────────────────────

async function resolveUniqueName(baseName: string): Promise<string> {
  const db = getDb();
  if (!db) return baseName;
  const [existing] = await db
    .select()
    .from(psProjects)
    .where(eq(psProjects.name, baseName))
    .limit(1);
  if (!existing) return baseName;
  for (let i = 2; i <= 10; i++) {
    const candidate = `${baseName} ${i}`;
    const [found] = await db
      .select()
      .from(psProjects)
      .where(eq(psProjects.name, candidate))
      .limit(1);
    if (!found) return candidate;
  }
  return `${baseName} ${Date.now()}`;
}

// ── Create ──────────────────────────────────────────────────────────────

export type CreatePSProjectInput = {
  name: string;
  scenario: string;
  context: Record<string, string>;
  answers: Record<string, string>;
  selectedScopeCode: string;
  selectedScopeLabel: string;
  topScopes: Array<{ scopeCode: string; scopeLabel: string; score: number }>;
  confidence: string;
  winnerMargin?: number;
  explainability: {
    positiveContributors: string[];
    negativeContributors: string[];
  };
  matrixVersionId: number;
  matrixVersion: string;
  overrideReason?: string;
  confidenceGateResult?: "HIGH" | "MEDIUM" | "LOW";
  kpiTargets?: {
    expectedCostSavings?: string;
    expectedTimeReductionPercent?: string;
    expectedRevenueImpact?: string;
    expectedDeliveryTimelineWeeks?: string;
    primarySuccessMetric?: string;
  };
};

export async function createPSProjectFromWizard(
  input: CreatePSProjectInput,
  actorId: number,
): Promise<PsProject> {
  const db = getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });

  const baseName = input.name.trim() || input.selectedScopeLabel || "Untitled Project";
  const finalName = await resolveUniqueName(baseName);

  // Resolve the full template bundle from scope code
  const bundle = await resolveTemplateBundle(input.selectedScopeCode);

  const result = await db.transaction(async (tx) => {
    // 1. Store wizard run trace
    const [wizardRun] = await tx
      .insert(psWizardRuns)
      .values({
        scenarioText: input.scenario,
        inputPayload: {
          context: input.context,
          answers: input.answers,
          matrixVersion: input.matrixVersion,
        },
        resultPayload: {
          selectedScopeCode: input.selectedScopeCode,
          topScopes: input.topScopes,
          confidence: input.confidence,
          explainability: input.explainability,
        },
        confidence: null,
        selectedSystemType: input.selectedScopeCode,
        createdBy: actorId,
        createdAt: new Date(),
      })
      .returning();

    // 2. Create PS project with resolved template bundle
    const [project] = await tx
      .insert(psProjects)
      .values({
        name: finalName,
        scenario: input.scenario,
        contextJson: input.context,
        selectedScopeCode: input.selectedScopeCode,
        topScopesJson: input.topScopes,
        confidence: input.confidence,
        winnerMargin: input.winnerMargin != null ? String(input.winnerMargin) : null,
        overrideReason: input.overrideReason || null,
        confidenceGateResult: input.confidenceGateResult || null,
        kpiTargetsJson: input.kpiTargets || null,
        explainabilityJson: input.explainability,
        matrixVersionId: input.matrixVersionId,
        templateBundleJson: {
          matrixVersion: input.matrixVersion,
          answers: input.answers,
          governance: bundle.governance,
          methods: bundle.methods,
          frameworks: bundle.frameworks,
          workflow: bundle.workflow,
          staffing: bundle.staffing,
          systemType: bundle.systemType,
          lifecycleType: bundle.lifecycleType,
          source: bundle.source,
        },
        wizardRunId: wizardRun.id,
        status: "DRAFT",
        createdBy: actorId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return { wizardRun, project };
  });

  await logPsAudit({
    actorId,
    action: "project.create",
    entityType: "ps_project",
    entityId: result.project.id,
    newValue: {
      wizardRunId: result.wizardRun.id,
      selectedScopeCode: input.selectedScopeCode,
      confidence: input.confidence,
      confidenceGateResult: input.confidenceGateResult || null,
      winnerMargin: input.winnerMargin ?? null,
      overrideReason: input.overrideReason || null,
      matrixVersionId: input.matrixVersionId,
      hasKpiTargets: !!input.kpiTargets,
    },
  });

  return result.project;
}

// ── Read ────────────────────────────────────────────────────────────────

export async function getPSProject(id: number): Promise<PsProject> {
  const db = getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });

  const [project] = await db
    .select()
    .from(psProjects)
    .where(eq(psProjects.id, id))
    .limit(1);

  if (!project)
    throw new TRPCError({ code: "NOT_FOUND", message: "PS project not found" });

  return project;
}

// ── List ────────────────────────────────────────────────────────────────

export async function listPSProjects(
  status?: string,
): Promise<PsProject[]> {
  const db = getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });

  const query = db.select().from(psProjects);
  if (status) {
    return query
      .where(eq(psProjects.status, status))
      .orderBy(desc(psProjects.id));
  }
  return query.orderBy(desc(psProjects.id));
}

