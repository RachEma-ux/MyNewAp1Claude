/**
 * PMT Wizard Router — Persistence & Gate Submission for PMI Wizard
 *
 * Endpoints:
 *   wizard.get        — Load wizard data from project metadata
 *   wizard.save       — Persist partial wizard data (auto-saves per step)
 *   wizard.submitG0   — Compile charter, create artifact, submit G0 gate
 *   wizard.submitG1   — Compile PMP, create baselines, submit G1 gate
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createHash } from "crypto";
import { router, protectedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { projects } from "./schema";
import { pmtGateRequests, pmtProjectArtifacts, pmtStateTransitions } from "./governance-schema";
import type { WizardData } from "@shared/pm-wizard-config";
import { createDefaultWizardData, ALL_WIZARD_STEPS, INITIATING_STEPS, PLANNING_STEPS } from "@shared/pm-wizard-config";
import { getMethodPack } from "@shared/pm-method-packs";

// ── Helpers ──

function sha256(content: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

/** Extract wizard data from project metadata, merging with defaults */
function extractWizard(metadata: Record<string, unknown> | null): WizardData {
  const defaults = createDefaultWizardData();
  if (!metadata?.wizard) return defaults;
  return { ...defaults, ...(metadata.wizard as Partial<WizardData>) };
}

/** Compute which steps are actually complete based on required fields */
function computeCompletedSteps(wizard: WizardData): string[] {
  const completed: string[] = [];
  for (const step of ALL_WIZARD_STEPS) {
    if (step.requiredFields.length === 0 && step.isGateStep) continue; // gate steps complete via submission
    if (step.conditional && !(wizard as any)[step.conditional]) {
      completed.push(step.id); // conditional steps that are disabled count as complete
      continue;
    }
    const allFilled = step.requiredFields.every((field) => {
      const val = (wizard as any)[field];
      if (val === undefined || val === null || val === "") return false;
      if (Array.isArray(val) && val.length === 0) return false;
      if (typeof val === "boolean") return val;
      return true;
    });
    if (allFilled) completed.push(step.id);
  }
  return completed;
}

// ── Router ──

export const wizardRouter = router({
  /** Get current wizard state for a project */
  get: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db.select().from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const wizard = extractWizard(rows[0].metadata);
      const completedSteps = computeCompletedSteps(wizard);
      const methodPackId = (rows[0].metadata as any)?.methodPackId || wizard.methodPackId || "";

      return {
        wizard: { ...wizard, completedSteps, methodPackId },
        projectStatus: rows[0].status,
        projectName: rows[0].name,
        methodPackId,
      };
    }),

  /** Save partial wizard data (auto-save on step navigation) */
  save: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      data: z.record(z.unknown()), // partial WizardData fields
      currentStep: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Read current metadata
      const rows = await db.select().from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const currentMeta = (rows[0].metadata || {}) as Record<string, unknown>;
      const currentWizard = extractWizard(currentMeta);

      // Merge new data
      const updatedWizard = {
        ...currentWizard,
        ...input.data,
        ...(input.currentStep ? { currentStep: input.currentStep } : {}),
      };

      // Also sync name/description back to project row if changed
      const projectUpdates: Record<string, unknown> = {
        metadata: { ...currentMeta, wizard: updatedWizard },
        updatedAt: new Date(),
      };
      if (input.data.methodPackId && typeof input.data.methodPackId === "string") {
        (projectUpdates.metadata as any).methodPackId = input.data.methodPackId;
      }
      if (input.data.name && typeof input.data.name === "string") {
        projectUpdates.name = input.data.name;
      }

      await db.update(projects).set(projectUpdates as any)
        .where(eq(projects.id, input.projectId));

      return { success: true };
    }),

  /** Submit G0 gate — Compile charter from wizard data, create artifacts, request gate */
  submitG0: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Load project + wizard data
      const rows = await db.select().from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const wizard = extractWizard(rows[0].metadata);

      // Validate required initiating fields
      const missingFields: string[] = [];
      for (const step of INITIATING_STEPS) {
        if (step.isGateStep) continue;
        for (const field of step.requiredFields) {
          const val = (wizard as any)[field];
          if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
            missingFields.push(field);
          }
        }
      }
      if (missingFields.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Missing required fields for G0: ${missingFields.join(", ")}`,
        });
      }

      // Build charter artifact content
      const charterContent: Record<string, unknown> = {
        name: wizard.name,
        sponsor: wizard.sponsor,
        projectManager: wizard.projectManager,
        deliveryApproach: wizard.deliveryApproach,
        objective: wizard.objective,
        businessCase: wizard.businessCase,
        problemStatement: wizard.problemStatement,
        expectedValue: wizard.expectedValue,
        constraints: wizard.constraints,
        assumptions: wizard.assumptions,
        inScope: wizard.inScope,
        outOfScope: wizard.outOfScope,
        deliverables: wizard.deliverables,
        acceptanceDefinition: wizard.acceptanceDefinition,
        riskTier: wizard.riskTier,
        dataTier: wizard.dataTier,
        decisionModel: wizard.decisionModel,
        initialRisks: wizard.initialRisks,
        milestones: wizard.milestones,
        generatedAt: new Date().toISOString(),
      };

      // Create charter artifact
      const [charterArtifact] = await db.insert(pmtProjectArtifacts).values({
        projectId: input.projectId,
        name: "Project Charter",
        artifactType: "charter",
        content: charterContent,
        sha256: sha256(charterContent),
        createdBy: ctx.user.id,
      }).returning();

      // Create stakeholder register artifact
      const stakeholderContent: Record<string, unknown> = {
        stakeholders: wizard.stakeholders,
        generatedAt: new Date().toISOString(),
      };
      await db.insert(pmtProjectArtifacts).values({
        projectId: input.projectId,
        name: "Stakeholder Register",
        artifactType: "plan",
        content: stakeholderContent,
        sha256: sha256(stakeholderContent),
        createdBy: ctx.user.id,
      });

      // Transition project to intake_review
      const currentState = rows[0].status;
      if (currentState === "draft_shell") {
        await db.update(projects).set({
          status: "intake_review",
          updatedAt: new Date(),
        }).where(eq(projects.id, input.projectId));

        await db.insert(pmtStateTransitions).values({
          projectId: input.projectId,
          fromState: currentState,
          toState: "intake_review",
          actorId: ctx.user.id,
          reason: "G0 charter submitted for review",
        });
      }

      // Create G0 gate request
      const [gateReq] = await db.insert(pmtGateRequests).values({
        projectId: input.projectId,
        gateId: "G0",
        status: "pending",
        requestedBy: ctx.user.id,
        reason: "Charter review and approval",
      }).returning();

      // Update wizard phase
      const currentMeta = (rows[0].metadata || {}) as Record<string, unknown>;
      const updatedWizard = { ...wizard, currentStep: "charter-review", phase: "initiating" as const };
      await db.update(projects).set({
        metadata: { ...currentMeta, wizard: updatedWizard },
      }).where(eq(projects.id, input.projectId));

      return {
        success: true,
        gateRequestId: gateReq.id,
        charterArtifactId: charterArtifact.id,
      };
    }),

  /** Submit G1 gate — Compile PMP from wizard data, create baselines, request gate */
  submitG1: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Load project + wizard data
      const rows = await db.select().from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const wizard = extractWizard(rows[0].metadata);
      const methodPackId = (rows[0].metadata as any)?.methodPackId || wizard.methodPackId || "";
      const pack = getMethodPack(methodPackId);

      // Validate required planning fields (method-aware)
      const missingFields: string[] = [];
      for (const step of PLANNING_STEPS) {
        if (step.isGateStep) continue;
        if (step.conditional && !(wizard as any)[step.conditional]) continue;
        for (const field of step.requiredFields) {
          // Skip WBS validation if pack doesn't require it
          if (field === "wbsNodes" && !pack.planningAdaptations.wbsRequired) continue;
          // Relax schedule validation for agile methods (no Gantt required)
          if (field === "scheduleTasks" && !pack.planningAdaptations.ganttRequired) continue;
          const val = (wizard as any)[field];
          if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
            missingFields.push(field);
          }
        }
      }
      if (missingFields.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Missing required fields for G1: ${missingFields.join(", ")}`,
        });
      }

      // Build baseline artifacts
      const scopeBaseline: Record<string, unknown> = {
        scopeStatement: wizard.scopeStatement,
        wbsNodes: wizard.wbsNodes,
        deliverables: wizard.deliverables,
        generatedAt: new Date().toISOString(),
      };
      const scheduleBaseline: Record<string, unknown> = {
        scheduleTasks: wizard.scheduleTasks,
        milestones: wizard.milestones,
        generatedAt: new Date().toISOString(),
      };
      const costBaseline: Record<string, unknown> = {
        budgetItems: wizard.budgetItems,
        generatedAt: new Date().toISOString(),
      };

      // Create baseline artifacts
      const [scopeArt] = await db.insert(pmtProjectArtifacts).values({
        projectId: input.projectId,
        name: "Scope Baseline",
        artifactType: "plan",
        content: scopeBaseline,
        sha256: sha256(scopeBaseline),
        createdBy: ctx.user.id,
      }).returning();

      const [schedArt] = await db.insert(pmtProjectArtifacts).values({
        projectId: input.projectId,
        name: "Schedule Baseline",
        artifactType: "schedule",
        content: scheduleBaseline,
        sha256: sha256(scheduleBaseline),
        createdBy: ctx.user.id,
      }).returning();

      const [costArt] = await db.insert(pmtProjectArtifacts).values({
        projectId: input.projectId,
        name: "Cost Baseline",
        artifactType: "plan",
        content: costBaseline,
        sha256: sha256(costBaseline),
        createdBy: ctx.user.id,
      }).returning();

      // Build full PMP artifact
      const pmpContent: Record<string, unknown> = {
        scopeBaseline,
        scheduleBaseline,
        costBaseline,
        qualityPlan: {
          qualityStandards: wizard.qualityStandards,
          acceptanceCriteria: wizard.acceptanceCriteria,
          definitionOfDone: wizard.definitionOfDone,
          reviewWorkflow: wizard.reviewWorkflow,
        },
        resourcePlan: { teamMembers: wizard.teamMembers },
        communicationsPlan: {
          reportingCadence: wizard.reportingCadence,
          stakeholderUpdateFrequency: wizard.stakeholderUpdateFrequency,
          channels: wizard.channels,
          escalationPath: wizard.escalationPath,
        },
        riskPlan: { riskRegister: wizard.riskRegister },
        engagementPlan: {
          engagementStrategy: wizard.engagementStrategy,
          communicationMapping: wizard.communicationMapping,
          changeReadiness: wizard.changeReadiness,
        },
        procurementPlan: wizard.procurementEnabled ? { vendors: wizard.vendors } : null,
        generatedAt: new Date().toISOString(),
      };

      await db.insert(pmtProjectArtifacts).values({
        projectId: input.projectId,
        name: "Project Management Plan",
        artifactType: "plan",
        content: pmpContent,
        sha256: sha256(pmpContent),
        createdBy: ctx.user.id,
      });

      // Transition to plan_gate_pending
      const currentState = rows[0].status;
      if (currentState === "planning") {
        await db.update(projects).set({
          status: "plan_gate_pending",
          updatedAt: new Date(),
        }).where(eq(projects.id, input.projectId));

        await db.insert(pmtStateTransitions).values({
          projectId: input.projectId,
          fromState: currentState,
          toState: "plan_gate_pending",
          actorId: ctx.user.id,
          reason: "PMP submitted for G1 authorization",
        });
      }

      // Create G1 gate request
      const [gateReq] = await db.insert(pmtGateRequests).values({
        projectId: input.projectId,
        gateId: "G1",
        status: "pending",
        requestedBy: ctx.user.id,
        reason: "PMP review and authorization",
      }).returning();

      // Update wizard phase
      const currentMeta = (rows[0].metadata || {}) as Record<string, unknown>;
      const updatedWizard = { ...wizard, currentStep: "pmp-review", phase: "planning" as const };
      await db.update(projects).set({
        metadata: { ...currentMeta, wizard: updatedWizard },
      }).where(eq(projects.id, input.projectId));

      return {
        success: true,
        gateRequestId: gateReq.id,
        baselines: {
          scopeBaselineHash: sha256(scopeBaseline),
          scheduleBaselineHash: sha256(scheduleBaseline),
          costBaselineHash: sha256(costBaseline),
        },
      };
    }),

  /** Apply a method pack to an existing project */
  applyMethodPack: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      methodPackId: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db.select().from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const currentMeta = (rows[0].metadata || {}) as Record<string, unknown>;
      const currentWizard = extractWizard(currentMeta);

      const methodPack = getMethodPack(input.methodPackId);
      const updatedWizard = {
        ...currentWizard,
        methodPackId: input.methodPackId,
        planningMode: methodPack.deliveryApproach,
      };

      await db.update(projects).set({
        metadata: { ...currentMeta, methodPackId: input.methodPackId, wizard: updatedWizard },
        updatedAt: new Date(),
      } as any).where(eq(projects.id, input.projectId));

      return { success: true, methodPackId: input.methodPackId };
    }),
});
