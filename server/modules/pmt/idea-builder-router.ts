/**
 * Idea Builder Router — tRPC API for Idea-to-PMI Project Builder Agent
 *
 * This is a REAL AI agent powered by an LLM via the provider system.
 * It analyzes project ideas, asks clarifying questions, and generates
 * all 11 PMI artifacts using actual LLM reasoning.
 *
 * Falls back to template generators when no LLM provider is available.
 *
 * Endpoints:
 *   agentInfo   — Get agent catalog info + provider status
 *   analyze     — LLM analyzes the idea, returns questions + insights
 *   chat        — Conversational message with the PM expert agent
 *   launch      — Create project + run full artifact generation via LLM
 *   status      — Get run status with DAG progress
 *   drafts      — List all drafts for a run
 *   commit      — Commit individual draft (human commit)
 *   commitAll   — Commit all pending drafts
 *   reject      — Reject individual draft
 *   validate    — Run validation on all drafts
 *   audit       — Get audit trail for a run
 *   list        — List all idea builder runs
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
} from "@shared/pm-agent-engine";
import type { IdeaBuilderInput } from "@shared/pm-artifact-schemas";
import {
  validateArtifact,
  validateCrossArtifactConsistency,
  validateAuthorityCompliance,
} from "./idea-builder-validation";
import {
  validateBindingShape,
} from "./agent-engine-guards";

// Real AI agent
import {
  getAvailableProvider,
  analyzeIdea,
  generateArtifactViaLLM,
  chatWithAgent,
  ensureAgentRegistered,
  parseLLMJson,
  AGENT_CATALOG_ID,
  AGENT_DISPLAY_NAME,
  AGENT_VERSION,
  AGENT_TAXONOMY_CLASSIFICATION,
  AGENT_CAPABILITIES,
} from "./idea-builder-agent";

// Template fallbacks (used when no LLM provider is available)
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

// Artifact type → DAG node mapping
const ARTIFACT_DAG_MAP: Record<string, string> = {
  scope_statement: "scope_builder",
  project_charter: "charter_builder",
  stakeholder_register: "stakeholder_register",
  wbs: "wbs_generator",
  schedule_baseline: "schedule_builder",
  cost_baseline: "cost_estimator",
  risk_register: "risk_register",
  communications_plan: "communications_plan",
  quality_plan: "quality_plan",
  change_control_plan: "change_control_plan",
  gate_readiness_report: "gate_readiness",
};

// Generation order (respects dependencies)
const ARTIFACT_ORDER = [
  "scope_statement",
  "project_charter",
  "stakeholder_register",
  "wbs",
  "schedule_baseline",
  "cost_baseline",
  "risk_register",
  "communications_plan",
  "quality_plan",
  "change_control_plan",
  "gate_readiness_report",
];

// ── LLM-Powered DAG Executor ────────────────────────────────────────────────

async function executeIdeaBuilderDag(
  runId: number,
  projectId: number,
  input: IdeaBuilderInput,
  userId: number,
  answers: Record<string, string> = {},
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("DB unavailable");

  const runs = await db.select().from(pmtAgentRuns).where(eq(pmtAgentRuns.id, runId)).limit(1);
  const run = runs[0];
  if (!run) throw new Error(`Run ${runId} not found`);

  const dagNodes = (run.planDag || []) as Array<{ id: string; agent_alias: string; depends_on: string[]; status: string }>;

  // Mark running
  await db.update(pmtAgentRuns).set({ status: "running", updatedAt: new Date() }).where(eq(pmtAgentRuns.id, runId));

  // Check for LLM provider
  const provider = getAvailableProvider();
  const useLLM = provider !== null;

  await emitAudit(runId, "_system", "run_started", {
    runType: run.runType,
    engine: useLLM ? "llm" : "template_fallback",
    providerType: provider?.type || "none",
    providerName: provider?.name || "none",
  }, userId);

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

  const artifacts: Record<string, Record<string, unknown>> = {};

  try {
    for (const node of dagNodes) {
      // Check cancellation
      const currentRun = await db.select({ status: pmtAgentRuns.status }).from(pmtAgentRuns).where(eq(pmtAgentRuns.id, runId)).limit(1);
      if (currentRun[0]?.status === "cancelled") { node.status = "skipped"; continue; }

      node.status = "running";
      await db.update(pmtAgentRuns).set({ planDag: dagNodes, updatedAt: new Date() }).where(eq(pmtAgentRuns.id, runId));
      await emitAudit(runId, node.agent_alias, "step_started", {
        nodeId: node.id,
        engine: useLLM ? "llm" : "template",
      }, userId);

      try {
        let draft: Record<string, unknown> | null = null;
        let artifactType = "";

        if (node.id === "resolve_bindings") {
          // System step: resolve catalog binding
          if (binding) {
            await emitAudit(runId, "_system", "binding_resolved", {
              catalog_id: binding.catalog_id,
              pinned_digest: binding.pinned_digest,
              llmAvailable: useLLM,
            }, userId);
          }
          // Register agent in catalog if not already done
          await ensureAgentRegistered().catch(() => {});
        } else if (node.id === "compile_evidence") {
          // System step: compile evidence
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
            generationEngine: useLLM ? "llm" : "template",
          }, userId);
        } else {
          // Artifact generation node
          // Find which artifact type this node generates
          const artifactEntry = Object.entries(ARTIFACT_DAG_MAP).find(([, nodeId]) => nodeId === node.id);
          if (artifactEntry) {
            artifactType = artifactEntry[0];

            if (useLLM && provider) {
              // ═══ LLM-POWERED GENERATION ═══
              try {
                draft = await generateArtifactViaLLM(
                  artifactType,
                  input.ideaText,
                  input,
                  artifacts,
                  answers,
                  provider,
                );
                await emitAudit(runId, "idea_to_pmi_builder", "llm_generation_success", {
                  artifactType,
                  providerType: provider.type,
                }, userId);
              } catch (llmErr: any) {
                console.warn(`[IdeaBuilder] LLM failed for ${artifactType}, falling back to template:`, llmErr.message);
                await emitAudit(runId, "idea_to_pmi_builder", "llm_generation_fallback", {
                  artifactType,
                  error: llmErr.message,
                  fallbackTo: "template",
                }, userId);
                // Fall back to template
                draft = generateArtifactWithTemplate(artifactType, input, artifacts);
              }
            } else {
              // ═══ TEMPLATE FALLBACK ═══
              draft = generateArtifactWithTemplate(artifactType, input, artifacts);
            }

            if (draft) {
              artifacts[artifactType] = draft;
            }
          }
        }

        // Store draft
        if (draft && artifactType) {
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
            engine: useLLM ? "llm" : "template",
          }, userId);
        }

        node.status = "completed";
        await emitAudit(runId, node.agent_alias, "step_completed", { nodeId: node.id }, userId);

      } catch (err: any) {
        node.status = "failed";
        await emitAudit(runId, node.agent_alias, "step_failed", { nodeId: node.id, error: err.message }, userId);
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
      status: finalStatus,
      planDag: dagNodes,
      outputs: {
        artifactCount: Object.keys(artifacts).length,
        engine: useLLM ? "llm" : "template",
        providerType: provider?.type || "none",
      },
      updatedAt: new Date(),
    }).where(eq(pmtAgentRuns.id, runId));

    await emitAudit(runId, "_system", anyFailed ? "run_failed" : "run_completed", {
      nodeStatuses: dagNodes.map((n) => ({ id: n.id, status: n.status })),
      artifactsGenerated: Object.keys(artifacts),
      engine: useLLM ? "llm" : "template",
    }, userId);

  } catch (err: any) {
    await db.update(pmtAgentRuns).set({ status: "failed", planDag: dagNodes, updatedAt: new Date() }).where(eq(pmtAgentRuns.id, runId));
    await emitAudit(runId, "_system", "run_failed", { error: err.message }, userId);
  }
}

/** Template fallback: generates artifact using hardcoded generators */
function generateArtifactWithTemplate(
  artifactType: string,
  input: IdeaBuilderInput,
  previousArtifacts: Record<string, Record<string, unknown>>,
): Record<string, unknown> | null {
  switch (artifactType) {
    case "scope_statement":
      return generateScopeStatement(input) as unknown as Record<string, unknown>;
    case "project_charter":
      return generateProjectCharter(input, previousArtifacts.scope_statement as any) as unknown as Record<string, unknown>;
    case "stakeholder_register":
      return generateStakeholderRegister(input) as unknown as Record<string, unknown>;
    case "wbs":
      return generateWbs(input, previousArtifacts.scope_statement as any) as unknown as Record<string, unknown>;
    case "schedule_baseline":
      return generateScheduleBaseline(input, previousArtifacts.wbs as any) as unknown as Record<string, unknown>;
    case "cost_baseline":
      return generateCostBaseline(input, previousArtifacts.wbs as any, previousArtifacts.schedule_baseline as any) as unknown as Record<string, unknown>;
    case "risk_register":
      return generateRiskRegister(input, previousArtifacts.scope_statement as any, previousArtifacts.wbs as any) as unknown as Record<string, unknown>;
    case "communications_plan":
      return generateCommunicationsPlan(input, previousArtifacts.stakeholder_register as any) as unknown as Record<string, unknown>;
    case "quality_plan":
      return generateQualityPlan(input, previousArtifacts.scope_statement as any) as unknown as Record<string, unknown>;
    case "change_control_plan":
      return generateChangeControlPlan(input) as unknown as Record<string, unknown>;
    case "gate_readiness_report":
      return generateGateReadinessReport(input, previousArtifacts) as unknown as Record<string, unknown>;
    default:
      return null;
  }
}

// ── Router ──────────────────────────────────────────────────────────────────

export const ideaBuilderRouter = router({

  /** Get agent info: catalog registration, taxonomy, provider status */
  agentInfo: protectedProcedure.query(async () => {
    const provider = getAvailableProvider();
    let catalogEntryId: number | null = null;
    try { catalogEntryId = await ensureAgentRegistered(); } catch {}

    return {
      catalogId: AGENT_CATALOG_ID,
      displayName: AGENT_DISPLAY_NAME,
      version: AGENT_VERSION,
      catalogEntryId,
      taxonomyClassification: AGENT_TAXONOMY_CLASSIFICATION,
      capabilities: [...AGENT_CAPABILITIES],
      llmAvailable: provider !== null,
      providerInfo: provider ? {
        id: provider.id,
        name: provider.name,
        type: provider.type,
      } : null,
      enforcementOverlay: {
        deny: [...DENIED_ACTIONS],
        requireHumanReview: true,
      },
    };
  }),

  /** LLM-powered idea analysis — returns insights + clarifying questions */
  analyze: protectedProcedure
    .input(z.object({
      ideaText: z.string().min(10, "Idea must be at least 10 characters"),
      budgetEnvelope: z.number().positive().optional(),
      deadline: z.string().optional(),
      riskTier: z.enum(["low", "medium", "high", "critical"]).optional(),
      methodology: z.enum(["predictive", "agile", "hybrid"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const provider = getAvailableProvider();
      if (!provider) {
        // No LLM available — return a basic analysis
        return {
          llmPowered: false,
          projectType: "general",
          estimatedComplexity: "medium",
          methodology: input.methodology || "predictive",
          keyInsights: [
            "No LLM provider configured — using template-based generation",
            "Configure an AI provider (OpenAI, Anthropic, etc.) in Provider Hub for intelligent analysis",
          ],
          identifiedRisks: [],
          identifiedStakeholders: [],
          missingInformation: [],
          clarifyingQuestions: [],
          confidence: { overall: 0.5, scopeClarity: 0.5, stakeholderClarity: 0.3, riskIdentification: 0.3, budgetClarity: input.budgetEnvelope ? 0.7 : 0.2, timelineClarity: input.deadline ? 0.7 : 0.2 },
          readyToGenerate: true,
          agentThinking: "Template mode: artifacts will be generated using structured templates. For AI-powered analysis, configure an LLM provider.",
        };
      }

      const builderInput: IdeaBuilderInput = {
        ideaText: input.ideaText,
        budgetEnvelope: input.budgetEnvelope,
        deadline: input.deadline,
        riskTier: input.riskTier,
        methodology: input.methodology,
      };

      const analysis = await analyzeIdea(input.ideaText, builderInput, provider);
      return { llmPowered: true, ...analysis };
    }),

  /** Conversational chat with the PM expert agent */
  chat: protectedProcedure
    .input(z.object({
      messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })),
    }))
    .mutation(async ({ input }) => {
      const provider = getAvailableProvider();
      if (!provider) {
        return {
          llmPowered: false,
          response: "I'm currently running in template mode because no LLM provider is configured. Please configure an AI provider (OpenAI, Anthropic, Ollama, etc.) in the Provider Hub to enable conversational analysis. You can still generate artifacts using the template engine — click 'Generate Artifacts' to proceed.",
        };
      }

      const response = await chatWithAgent(
        input.messages.map(m => ({ role: m.role, content: m.content })),
        provider,
      );

      return { llmPowered: true, response };
    }),

  /** Create project + run full artifact generation (LLM or template) */
  launch: protectedProcedure
    .input(z.object({
      ideaText: z.string().min(20, "Idea must be at least 20 characters"),
      budgetEnvelope: z.number().positive().optional(),
      deadline: z.string().optional(),
      riskTier: z.enum(["low", "medium", "high", "critical"]).optional(),
      methodology: z.enum(["predictive", "agile", "hybrid"]).optional(),
      answers: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const firstSentence = input.ideaText.split(/[.!?]/)[0]?.trim() || input.ideaText.substring(0, 60);
      const projectName = firstSentence.length > 60 ? firstSentence.substring(0, 60) : firstSentence;

      const wsId = await getOrCreatePMWorkspace(ctx.user.id);

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
          createdVia: "idea_builder_agent",
          answers: input.answers || {},
        },
      }).returning();

      const dagNodes = getDagTemplate("idea_to_pmi_build");
      if (!dagNodes) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DAG template not found" });

      const provider = getAvailableProvider();
      const [run] = await db.insert(pmtAgentRuns).values({
        projectId: project.id,
        runType: "idea_to_pmi_build",
        packId: "idea_to_pmi_full_build",
        status: "pending",
        phase: "initiating",
        planDag: dagNodes,
        outputs: { engine: provider ? "llm" : "template" },
        initiatedBy: ctx.user.id,
      }).returning();

      const builderInput: IdeaBuilderInput = {
        ideaText: input.ideaText,
        budgetEnvelope: input.budgetEnvelope,
        deadline: input.deadline,
        riskTier: input.riskTier,
        methodology: input.methodology,
      };

      executeIdeaBuilderDag(run.id, project.id, builderInput, ctx.user.id, input.answers || {}).catch((err) => {
        console.error(`[IdeaBuilder] Run ${run.id} failed:`, err.message);
      });

      return {
        runId: run.id,
        projectId: project.id,
        projectName,
        engine: provider ? "llm" : "template",
        providerName: provider?.name || null,
      };
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
