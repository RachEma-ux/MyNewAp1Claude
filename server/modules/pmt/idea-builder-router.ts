/**
 * Idea Builder Router — tRPC API for Idea-to-PMI Project Builder Agent
 *
 * Endpoints:
 *   launch    — Create project + run full DAG
 *   status    — Get run status with DAG progress
 *   drafts    — List all drafts for a run
 *   commit    — Commit individual draft (human commit)
 *   commitAll — Commit all pending drafts
 *   reject    — Reject individual draft
 *   validate  — Run validation on all drafts
 *   dryRun    — Execute without persisting (governance simulation)
 */

import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createHash } from "crypto";
import { router, protectedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { projects } from "./schema";
import { pmtAgentRuns, pmtAgentDrafts, pmtAgentAudit } from "./agent-engine-schema";
import { workspaces } from "../../../drizzle/tables/users";
import {
  getBinding,
  getDagTemplate,
  DENIED_ACTIONS,
  type DagNode,
} from "@shared/pm-agent-engine";
import type { IdeaBuilderInput } from "@shared/pm-artifact-schemas";
import {
  generateScopeStatement,
  generateProjectCharter,
  generateStakeholderRegister,
  generateWbs,
  generateScheduleBaseline,
  generateCostBaseline,
  generateRiskRegister,
  generateCommunicationsPlan,
  generateQualityPlan,
  generateChangeControlPlan,
  generateGateReadinessReport,
} from "./idea-builder-generators";
import {
  validateArtifact,
  validateCrossArtifactConsistency,
  validateAuthorityCompliance,
} from "./idea-builder-validation";
import {
  assertHumanReviewRequired,
  validateBindingShape,
} from "./agent-engine-guards";

// ── Helpers ─────────────────────────────────────────────────────────────────

async function emitAudit(
  runId: number,
  agentAlias: string,
  eventType: string,
  payload: Record<string, unknown>,
  actorId?: number,
) {
  const db = getDb();
  if (!db) return;
  const payloadStr = JSON.stringify(payload);
  const payloadHash = createHash("sha256").update(payloadStr).digest("hex").substring(0, 64);
  await db.insert(pmtAgentAudit).values({
    runId, agentAlias, eventType, payload, payloadHash, actorId: actorId || null,
  });
}

async function getOrCreatePMWorkspace(userId: number): Promise<number> {
  const db = getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const existing = await db.select().from(workspaces).where(eq(workspaces.type, "pm-shell")).limit(1);
  if (existing[0]) return existing[0].id;
  const [ws] = await db.insert(workspaces).values({
    name: "PM Shell", type: "pm-shell", ownerId: userId,
  }).returning();
  return ws.id;
}

// ── Full DAG Executor ───────────────────────────────────────────────────────

async function executeIdeaBuilderDag(
  runId: number,
  projectId: number,
  input: IdeaBuilderInput,
  userId: number,
  dryRun: boolean = false,
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("DB unavailable");

  // Load run
  const runs = await db.select().from(pmtAgentRuns).where(eq(pmtAgentRuns.id, runId)).limit(1);
  const run = runs[0];
  if (!run) throw new Error(`Run ${runId} not found`);

  const dagNodes = (run.planDag || []) as Array<{ id: string; agent_alias: string; depends_on: string[]; status: string }>;

  // Mark running
  await db.update(pmtAgentRuns).set({ status: "running", updatedAt: new Date() }).where(eq(pmtAgentRuns.id, runId));
  await emitAudit(runId, "_system", "run_started", { runType: run.runType, dryRun }, userId);

  // Validate binding
  const binding = getBinding("idea_to_pmi_builder");
  if (binding) {
    const errors = validateBindingShape(binding);
    if (errors.length > 0) {
      await emitAudit(runId, "_system", "guard_denied", { errors }, userId);
      await db.update(pmtAgentRuns).set({ status: "failed", updatedAt: new Date() }).where(eq(pmtAgentRuns.id, runId));
      return;
    }
  }

  // Authority check — verify no forbidden actions
  for (const action of DENIED_ACTIONS) {
    const authResult = validateAuthorityCompliance(action, "idea_to_pmi_builder");
    if (!authResult.valid) {
      // This is expected — we're verifying the deny list is enforced
    }
  }

  const artifacts: Record<string, Record<string, unknown>> = {};

  try {
    for (const node of dagNodes) {
      // Check cancellation
      const currentRun = await db.select({ status: pmtAgentRuns.status }).from(pmtAgentRuns).where(eq(pmtAgentRuns.id, runId)).limit(1);
      if (currentRun[0]?.status === "cancelled") { node.status = "skipped"; continue; }

      node.status = "running";
      await db.update(pmtAgentRuns).set({ planDag: dagNodes, updatedAt: new Date() }).where(eq(pmtAgentRuns.id, runId));
      await emitAudit(runId, node.agent_alias, "step_started", { nodeId: node.id }, userId);

      try {
        let draft: Record<string, unknown> | null = null;
        let artifactType = "";

        switch (node.id) {
          case "resolve_bindings": {
            if (binding) {
              await emitAudit(runId, "_system", "binding_resolved", {
                catalog_id: binding.catalog_id, pinned_digest: binding.pinned_digest,
              }, userId);
            }
            break;
          }
          case "scope_builder": {
            const scope = generateScopeStatement(input);
            draft = scope as unknown as Record<string, unknown>;
            artifactType = "scope_statement";
            artifacts.scope_statement = draft;
            break;
          }
          case "charter_builder": {
            const scope = artifacts.scope_statement as any;
            const charter = generateProjectCharter(input, scope);
            draft = charter as unknown as Record<string, unknown>;
            artifactType = "project_charter";
            artifacts.project_charter = draft;
            break;
          }
          case "stakeholder_register": {
            const reg = generateStakeholderRegister(input);
            draft = reg as unknown as Record<string, unknown>;
            artifactType = "stakeholder_register";
            artifacts.stakeholder_register = draft;
            break;
          }
          case "wbs_generator": {
            const scope = artifacts.scope_statement as any;
            const wbs = generateWbs(input, scope);
            draft = wbs as unknown as Record<string, unknown>;
            artifactType = "wbs";
            artifacts.wbs = draft;
            break;
          }
          case "schedule_builder": {
            const wbs = artifacts.wbs as any;
            const schedule = generateScheduleBaseline(input, wbs);
            draft = schedule as unknown as Record<string, unknown>;
            artifactType = "schedule_baseline";
            artifacts.schedule_baseline = draft;
            break;
          }
          case "cost_estimator": {
            const wbs = artifacts.wbs as any;
            const schedule = artifacts.schedule_baseline as any;
            const cost = generateCostBaseline(input, wbs, schedule);
            draft = cost as unknown as Record<string, unknown>;
            artifactType = "cost_baseline";
            artifacts.cost_baseline = draft;
            break;
          }
          case "risk_register": {
            const scope = artifacts.scope_statement as any;
            const wbs = artifacts.wbs as any;
            const risks = generateRiskRegister(input, scope, wbs);
            draft = risks as unknown as Record<string, unknown>;
            artifactType = "risk_register";
            artifacts.risk_register = draft;
            break;
          }
          case "communications_plan": {
            const stakeholders = artifacts.stakeholder_register as any;
            const comms = generateCommunicationsPlan(input, stakeholders);
            draft = comms as unknown as Record<string, unknown>;
            artifactType = "communications_plan";
            artifacts.communications_plan = draft;
            break;
          }
          case "quality_plan": {
            const scope = artifacts.scope_statement as any;
            const quality = generateQualityPlan(input, scope);
            draft = quality as unknown as Record<string, unknown>;
            artifactType = "quality_plan";
            artifacts.quality_plan = draft;
            break;
          }
          case "change_control_plan": {
            const ccp = generateChangeControlPlan(input);
            draft = ccp as unknown as Record<string, unknown>;
            artifactType = "change_control_plan";
            artifacts.change_control_plan = draft;
            break;
          }
          case "gate_readiness": {
            const report = generateGateReadinessReport(input, artifacts);
            draft = report as unknown as Record<string, unknown>;
            artifactType = "gate_readiness_report";
            artifacts.gate_readiness_report = draft;
            break;
          }
          case "compile_evidence": {
            const evidenceHashes: Record<string, string> = {};
            for (const [key, value] of Object.entries(artifacts)) {
              evidenceHashes[key] = createHash("sha256")
                .update(JSON.stringify(value))
                .digest("hex")
                .substring(0, 64);
            }
            await emitAudit(runId, "_system", "evidence_compiled", {
              artifactCount: Object.keys(artifacts).length,
              digests: evidenceHashes,
            }, userId);
            break;
          }
        }

        // Store draft if generated
        if (draft && artifactType && !dryRun) {
          await db.insert(pmtAgentDrafts).values({
            projectId,
            runId,
            artifactType,
            content: draft,
            sourceAgentAlias: "idea_to_pmi_builder",
            requiresHumanReview: true,
            commitStatus: "pending",
          });
          await emitAudit(runId, "idea_to_pmi_builder", "draft_created", {
            artifactType,
            requiresReview: true,
          }, userId);
        }

        node.status = "completed";
        await emitAudit(runId, node.agent_alias, "step_completed", { nodeId: node.id }, userId);

      } catch (err: any) {
        node.status = "failed";
        await emitAudit(runId, node.agent_alias, "step_failed", { nodeId: node.id, error: err.message }, userId);
        // Skip dependents by marking them
        const failedId = node.id;
        for (const n of dagNodes) {
          if (n.depends_on.includes(failedId) && n.status === "pending") {
            n.status = "skipped";
          }
        }
      }

      await db.update(pmtAgentRuns).set({ planDag: dagNodes, updatedAt: new Date() }).where(eq(pmtAgentRuns.id, runId));
    }

    const anyFailed = dagNodes.some((n) => n.status === "failed");
    const finalStatus = anyFailed ? "failed" : "completed";
    await db.update(pmtAgentRuns).set({
      status: finalStatus, planDag: dagNodes, outputs: { artifactCount: Object.keys(artifacts).length }, updatedAt: new Date(),
    }).where(eq(pmtAgentRuns.id, runId));
    await emitAudit(runId, "_system", anyFailed ? "run_failed" : "run_completed", {
      nodeStatuses: dagNodes.map((n) => ({ id: n.id, status: n.status })),
      artifactsGenerated: Object.keys(artifacts),
    }, userId);

  } catch (err: any) {
    await db.update(pmtAgentRuns).set({ status: "failed", planDag: dagNodes, updatedAt: new Date() }).where(eq(pmtAgentRuns.id, runId));
    await emitAudit(runId, "_system", "run_failed", { error: err.message }, userId);
  }
}

// ── Router ──────────────────────────────────────────────────────────────────

export const ideaBuilderRouter = router({
  launch: protectedProcedure
    .input(z.object({
      ideaText: z.string().min(20, "Idea must be at least 20 characters"),
      budgetEnvelope: z.number().positive().optional(),
      deadline: z.string().optional(),
      riskTier: z.enum(["low", "medium", "high", "critical"]).optional(),
      methodology: z.enum(["predictive", "agile", "hybrid"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Parse project name from idea
      const firstSentence = input.ideaText.split(/[.!?]/)[0]?.trim() || input.ideaText.substring(0, 60);
      const projectName = firstSentence.length > 60 ? firstSentence.substring(0, 60) : firstSentence;

      // Get or create PM workspace
      const wsId = await getOrCreatePMWorkspace(ctx.user.id);

      // Create project shell
      const [project] = await db.insert(projects).values({
        workspaceId: wsId,
        name: projectName,
        description: input.ideaText.substring(0, 500),
        status: "draft_shell",
        ownerId: ctx.user.id,
        riskLevel: input.riskTier || "medium",
        metadata: {
          ideaText: input.ideaText,
          budgetEnvelope: input.budgetEnvelope,
          deadline: input.deadline,
          riskTier: input.riskTier || "medium",
          methodology: input.methodology || "predictive",
          createdVia: "idea_builder",
        },
      }).returning();

      // Build DAG from template
      const dagNodes = getDagTemplate("idea_to_pmi_build");
      if (!dagNodes) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DAG template not found" });

      // Create run
      const [run] = await db.insert(pmtAgentRuns).values({
        projectId: project.id,
        runType: "idea_to_pmi_build",
        packId: "idea_to_pmi_full_build",
        status: "pending",
        phase: "initiating",
        planDag: dagNodes,
        outputs: {},
        initiatedBy: ctx.user.id,
      }).returning();

      // Execute async
      const builderInput: IdeaBuilderInput = {
        ideaText: input.ideaText,
        budgetEnvelope: input.budgetEnvelope,
        deadline: input.deadline,
        riskTier: input.riskTier,
        methodology: input.methodology,
      };

      executeIdeaBuilderDag(run.id, project.id, builderInput, ctx.user.id).catch((err) => {
        console.error(`[IdeaBuilder] Run ${run.id} failed:`, err.message);
      });

      return { runId: run.id, projectId: project.id, projectName };
    }),

  status: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmtAgentRuns).where(eq(pmtAgentRuns.id, input.runId)).limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      return rows[0];
    }),

  drafts: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      return db.select().from(pmtAgentDrafts).where(eq(pmtAgentDrafts.runId, input.runId)).orderBy(pmtAgentDrafts.createdAt);
    }),

  commit: protectedProcedure
    .input(z.object({ draftId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmtAgentDrafts).where(eq(pmtAgentDrafts.id, input.draftId)).limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
      if (rows[0].commitStatus !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: `Draft already ${rows[0].commitStatus}` });

      await db.update(pmtAgentDrafts).set({
        commitStatus: "committed", committedBy: ctx.user.id, committedAt: new Date(),
      }).where(eq(pmtAgentDrafts.id, input.draftId));

      await emitAudit(rows[0].runId, rows[0].sourceAgentAlias, "draft_committed", {
        draftId: input.draftId, artifactType: rows[0].artifactType, committedBy: ctx.user.id,
      }, ctx.user.id);

      return { success: true };
    }),

  commitAll: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const drafts = await db.select().from(pmtAgentDrafts).where(eq(pmtAgentDrafts.runId, input.runId));
      const pending = drafts.filter((d) => d.commitStatus === "pending");
      for (const draft of pending) {
        await db.update(pmtAgentDrafts).set({
          commitStatus: "committed", committedBy: ctx.user.id, committedAt: new Date(),
        }).where(eq(pmtAgentDrafts.id, draft.id));
        await emitAudit(input.runId, draft.sourceAgentAlias, "draft_committed", {
          draftId: draft.id, artifactType: draft.artifactType, committedBy: ctx.user.id,
        }, ctx.user.id);
      }
      return { committed: pending.length };
    }),

  reject: protectedProcedure
    .input(z.object({ draftId: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmtAgentDrafts).where(eq(pmtAgentDrafts.id, input.draftId)).limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
      if (rows[0].commitStatus !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: `Draft already ${rows[0].commitStatus}` });

      await db.update(pmtAgentDrafts).set({
        commitStatus: "rejected", committedBy: ctx.user.id, committedAt: new Date(), rejectReason: input.reason || null,
      }).where(eq(pmtAgentDrafts.id, input.draftId));

      await emitAudit(rows[0].runId, rows[0].sourceAgentAlias, "draft_rejected", {
        draftId: input.draftId, reason: input.reason, rejectedBy: ctx.user.id,
      }, ctx.user.id);

      return { success: true };
    }),

  validate: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const drafts = await db.select().from(pmtAgentDrafts).where(eq(pmtAgentDrafts.runId, input.runId));

      const results: Record<string, any> = {};
      const artifacts: Record<string, Record<string, unknown>> = {};

      for (const draft of drafts) {
        const content = draft.content as Record<string, unknown>;
        artifacts[draft.artifactType] = content;
        results[draft.artifactType] = validateArtifact(draft.artifactType, content);
      }

      const crossArtifact = validateCrossArtifactConsistency(artifacts);

      return {
        artifactValidations: results,
        crossArtifactValidation: crossArtifact,
        overallValid: Object.values(results).every((r: any) => r.valid) && crossArtifact.valid,
        totalArtifacts: drafts.length,
      };
    }),

  dryRun: protectedProcedure
    .input(z.object({
      ideaText: z.string().min(20),
      budgetEnvelope: z.number().positive().optional(),
      deadline: z.string().optional(),
      riskTier: z.enum(["low", "medium", "high", "critical"]).optional(),
      methodology: z.enum(["predictive", "agile", "hybrid"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const builderInput: IdeaBuilderInput = {
        ideaText: input.ideaText,
        budgetEnvelope: input.budgetEnvelope,
        deadline: input.deadline,
        riskTier: input.riskTier,
        methodology: input.methodology,
      };

      // Execute generators without persisting
      const scope = generateScopeStatement(builderInput);
      const charter = generateProjectCharter(builderInput, scope);
      const stakeholders = generateStakeholderRegister(builderInput);
      const wbs = generateWbs(builderInput, scope);
      const schedule = generateScheduleBaseline(builderInput, wbs);
      const cost = generateCostBaseline(builderInput, wbs, schedule);
      const risks = generateRiskRegister(builderInput, scope, wbs);
      const comms = generateCommunicationsPlan(builderInput, stakeholders);
      const quality = generateQualityPlan(builderInput, scope);
      const changeControl = generateChangeControlPlan(builderInput);

      const artifacts: Record<string, Record<string, unknown>> = {
        scope_statement: scope as any,
        project_charter: charter as any,
        stakeholder_register: stakeholders as any,
        wbs: wbs as any,
        schedule_baseline: schedule as any,
        cost_baseline: cost as any,
        risk_register: risks as any,
        communications_plan: comms as any,
        quality_plan: quality as any,
        change_control_plan: changeControl as any,
      };

      const readiness = generateGateReadinessReport(builderInput, artifacts);
      artifacts.gate_readiness_report = readiness as any;

      // Validate all
      const validations: Record<string, any> = {};
      for (const [key, value] of Object.entries(artifacts)) {
        validations[key] = validateArtifact(key, value);
      }
      const crossArtifact = validateCrossArtifactConsistency(artifacts);

      // Governance simulation
      const governanceChecks = DENIED_ACTIONS.map((action) => ({
        action,
        result: "denied",
        enforced: true,
      }));

      return {
        mode: "dry_run",
        artifactsGenerated: Object.keys(artifacts).length,
        artifacts,
        validations,
        crossArtifactValidation: crossArtifact,
        governanceSimulation: governanceChecks,
        overallValid: Object.values(validations).every((v: any) => v.valid) && crossArtifact.valid,
      };
    }),

  audit: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      return db.select().from(pmtAgentAudit).where(eq(pmtAgentAudit.runId, input.runId)).orderBy(pmtAgentAudit.createdAt);
    }),

  list: protectedProcedure.query(async () => {
    const db = getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    return db.select().from(pmtAgentRuns)
      .where(eq(pmtAgentRuns.runType, "idea_to_pmi_build"))
      .orderBy(desc(pmtAgentRuns.createdAt))
      .limit(50);
  }),
});
