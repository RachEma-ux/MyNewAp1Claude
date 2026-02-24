/**
 * LLM Creation & Training Pipeline
 *
 * Extracted from llm.ts — provides endpoints for the full LLM creation workflow:
 * project management, dataset creation, training, evaluation, quantization, and job queue.
 * Following "COMPLETE LLM CREATION GUIDE" methodology.
 */

import { z } from "zod";
import { protectedProcedure, governedProcedure } from "../_core/trpc";
import { createLLM } from "../db";
import { jobQueue } from "../services/job-queue";
import { getAuditLogger } from "../services/auditLogger";

/**
 * Procedure map for LLM creation & training routes.
 * Spread into llmRouter in llm.ts to preserve the flat route namespace.
 */
export const llmCreationProcedures = {
  // ============================================================================
  // LLM Creation & Training Pipeline
  // ============================================================================

  createCreationProject: governedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        path: z.enum(["PATH_A", "PATH_B"]),
        target: z.object({
          useCase: z.string(),
          deployment: z.string(),
          maxModelSize: z.string(),
          contextLength: z.string(),
          allowedData: z.string(),
        }),
        baseModel: z
          .object({
            name: z.string(),
            ollamaTag: z.string().optional(),
            hfRepo: z.string().optional(),
            size: z.string().optional(),
            license: z.string().optional(),
            context: z.number().optional(),
            rationale: z.string().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { insertInto, getDb, updateTable, eq } = await import("../db");
      const { llmCreationProjects, llmCreationAuditEvents } = await import("../../drizzle/schema");
      const { sql } = await import("drizzle-orm");

      const db = getDb();
      if (!db) throw new Error("Database not available");
      try {
        await db.execute(sql`SELECT 1 FROM llm_creation_projects LIMIT 0`);
      } catch {
        console.log("[LLM Create] Table llm_creation_projects missing, creating...");
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS "llm_creation_projects" (
            "id" serial PRIMARY KEY,
            "name" varchar(255) NOT NULL,
            "description" text,
            "path" varchar(10) NOT NULL,
            "target" json NOT NULL,
            "baseModel" json,
            "status" varchar(50) NOT NULL DEFAULT 'draft',
            "currentPhase" varchar(50),
            "progress" integer DEFAULT 0,
            "finalModelPath" varchar(512),
            "ollamaModelName" varchar(255),
            "deploymentStatus" varchar(50),
            "llmId" integer,
            "createdBy" integer NOT NULL,
            "createdAt" timestamp DEFAULT now() NOT NULL,
            "updatedAt" timestamp DEFAULT now() NOT NULL,
            "completedAt" timestamp
          )
        `);
        await db.execute(sql`CREATE TABLE IF NOT EXISTS "llm_creation_audit_events" (
            "id" serial PRIMARY KEY,
            "eventType" varchar(100) NOT NULL,
            "projectId" integer NOT NULL,
            "actor" integer NOT NULL,
            "phase" varchar(50),
            "action" varchar(100) NOT NULL,
            "payload" json,
            "status" varchar(50) NOT NULL DEFAULT 'success',
            "errorMessage" text,
            "createdAt" timestamp DEFAULT now() NOT NULL
          )
        `);
        console.log("[LLM Create] Tables created successfully");
      }

      const [project] = await insertInto(llmCreationProjects)
        .values({
          name: input.name,
          description: input.description,
          path: input.path,
          target: input.target,
          baseModel: input.baseModel || null,
          status: "draft",
          currentPhase: "phase_0_planning",
          createdBy: ctx.user.id,
        })
        .returning();

      // Audit event
      try {
        await insertInto(llmCreationAuditEvents).values({
          eventType: "project.created",
          projectId: project.id,
          actor: ctx.user.id,
          phase: "phase_0_planning",
          action: "create_project",
          payload: { name: input.name, path: input.path, target: input.target },
          status: "success",
        });
      } catch (e) {
        console.warn("[LLM Create] Audit event insert failed:", e);
      }

      getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "llm_creation_project",
        target_id: String(project.id),
        decision_result: "success",
        metadata: { name: input.name, path: input.path },
      });

      // Auto-register LLM identity in the registry
      try {
        const useCaseRoleMap: Record<string, string> = {
          chat_assistant: "executor",
          enterprise_doc_qa: "executor",
          coding_helper: "executor",
          router: "router",
          agent: "planner",
        };
        const target = input.target as any;
        const role = useCaseRoleMap[target?.useCase] || "executor";

        const pathLabel = input.path === "PATH_A" ? "Fine-tuning" : "Pre-training";
        const baseModel = input.baseModel as any;
        const baseModelInfo = baseModel
          ? `Base model: ${baseModel.name || "TBD"}${baseModel.size ? ` (${baseModel.size})` : ""}`
          : "Base model: TBD";

        const description = [
          `[Creation Project] ${pathLabel}`,
          baseModelInfo,
          `Use case: ${target?.useCase || "general"}`,
          `Deployment: ${target?.deployment || "local"}`,
          target?.contextLength ? `Context: ${target.contextLength}` : null,
          `Phase: phase_0_planning | Status: draft`,
        ].filter(Boolean).join(" | ");

        const llm = await createLLM({
          name: input.name,
          description,
          role: role as any,
          ownerTeam: null,
          createdBy: ctx.user.id,
        });

        await updateTable(llmCreationProjects)
          .set({ llmId: llm.id })
          .where(eq(llmCreationProjects.id, project.id));

        project.llmId = llm.id;

        try {
          await insertInto(llmCreationAuditEvents).values({
            eventType: "llm.auto_registered",
            projectId: project.id,
            actor: ctx.user.id,
            phase: "phase_0_planning",
            action: "auto_register_llm",
            payload: { llmId: llm.id, role, name: input.name },
            status: "success",
          });
        } catch (_) {}

        console.log(`[LLM Create] Auto-registered LLM identity #${llm.id} for project #${project.id}`);
      } catch (regErr) {
        console.warn("[LLM Create] Auto-registration of LLM identity failed:", regErr);
      }

      return project;
    }),

  listCreationProjects: protectedProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          path: z.enum(["PATH_A", "PATH_B"]).optional(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const { db } = await import("../db");
      const { llmCreationProjects } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");

      const conditions = [eq(llmCreationProjects.createdBy, ctx.user.id)];

      if (input?.status) {
        conditions.push(eq(llmCreationProjects.status, input.status));
      }

      if (input?.path) {
        conditions.push(eq(llmCreationProjects.path, input.path));
      }

      return await db.select().from(llmCreationProjects).where(and(...conditions));
    }),

  getCreationProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      const { db } = await import("../db");
      const {
        llmCreationProjects,
        llmDatasets,
        llmTrainingRuns,
        llmEvaluations,
        llmQuantizations
      } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const [project] = await db
        .select()
        .from(llmCreationProjects)
        .where(eq(llmCreationProjects.id, input.projectId));

      if (!project) {
        throw new Error("Project not found");
      }

      const datasets = await db
        .select()
        .from(llmDatasets)
        .where(eq(llmDatasets.projectId, input.projectId));

      const trainingRuns = await db
        .select()
        .from(llmTrainingRuns)
        .where(eq(llmTrainingRuns.projectId, input.projectId));

      const evaluations = await db
        .select()
        .from(llmEvaluations)
        .where(eq(llmEvaluations.projectId, input.projectId));

      const quantizations = await db
        .select()
        .from(llmQuantizations)
        .where(eq(llmQuantizations.projectId, input.projectId));

      return {
        project,
        datasets,
        trainingRuns,
        evaluations,
        quantizations,
      };
    }),

  updateCreationProject: governedProcedure
    .input(
      z.object({
        projectId: z.number(),
        status: z.string().optional(),
        currentPhase: z.string().optional(),
        progress: z.number().min(0).max(100).optional(),
        baseModel: z.any().optional(),
        finalModelPath: z.string().optional(),
        ollamaModelName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, updateTable, eq } = await import("../db");
      const { llmCreationProjects, llmCreationAuditEvents } = await import("../../drizzle/schema");

      const { projectId, ...updates } = input;

      const [updated] = await updateTable(llmCreationProjects)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(llmCreationProjects.id, projectId))
        .returning();

      const { insertInto } = await import("../db");
      await insertInto(llmCreationAuditEvents).values({
        eventType: "project.updated",
        projectId: projectId,
        actor: ctx.user.id,
        phase: updates.currentPhase || "unknown",
        action: "update_project",
        payload: updates,
        status: "success",
      });

      return updated;
    }),

  createDataset: governedProcedure
    .input(
      z.object({
        projectId: z.number(),
        name: z.string().min(1).max(255),
        type: z.enum(["sft", "dpo", "eval", "pretrain"]),
        source: z.enum(["upload", "synthetic", "public", "mixed"]).optional(),
        format: z.enum(["jsonl", "csv", "parquet"]),
        filePath: z.string().max(512),
        fileSize: z.number().optional(),
        recordCount: z.number().optional(),
        tokenCount: z.number().optional(),
        stats: z.any().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, insertInto } = await import("../db");
      const { llmDatasets, llmCreationAuditEvents } = await import("../../drizzle/schema");

      const [dataset] = await insertInto(llmDatasets)
        .values({
          ...input,
          status: "pending",
          createdBy: ctx.user.id,
        })
        .returning();

      await insertInto(llmCreationAuditEvents).values({
        eventType: "dataset.created",
        projectId: input.projectId,
        datasetId: dataset.id,
        actor: ctx.user.id,
        phase: "phase_2_dataset",
        action: "create_dataset",
        payload: { name: input.name, type: input.type, format: input.format },
        status: "success",
      });

      return dataset;
    }),

  updateDataset: governedProcedure
    .input(
      z.object({
        datasetId: z.number(),
        status: z.string().optional(),
        validated: z.boolean().optional(),
        validationErrors: z.any().optional(),
        qualityScore: z.number().optional(),
        qualityChecks: z.any().optional(),
        stats: z.any().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, updateTable, eq } = await import("../db");
      const { llmDatasets } = await import("../../drizzle/schema");

      const { datasetId, qualityScore, ...updates } = input;

      const [updated] = await updateTable(llmDatasets)
        .set({
          ...updates,
          qualityScore: qualityScore?.toString(),
          updatedAt: new Date()
        })
        .where(eq(llmDatasets.id, datasetId))
        .returning();

      return updated;
    }),

  startTraining: governedProcedure
    .input(
      z.object({
        projectId: z.number(),
        trainingType: z.enum(["sft", "dpo", "tool_tuning", "pretrain"]),
        phase: z.string(),
        config: z.any(),
        datasetIds: z.array(z.number()),
        framework: z.enum(["huggingface", "deepspeed", "megatron", "ollama"]).optional(),
        accelerator: z.enum(["cpu", "cuda", "tpu"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, insertInto } = await import("../db");
      const { llmTrainingRuns, llmCreationAuditEvents } = await import("../../drizzle/schema");
      const crypto = await import("crypto");

      const configHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(input.config))
        .digest("hex");

      const [trainingRun] = await insertInto(llmTrainingRuns)
        .values({
          projectId: input.projectId,
          trainingType: input.trainingType,
          phase: input.phase,
          config: input.config,
          configHash,
          datasetIds: input.datasetIds,
          framework: input.framework || "huggingface",
          accelerator: input.accelerator || "cpu",
          status: "pending",
          createdBy: ctx.user.id,
        })
        .returning();

      await insertInto(llmCreationAuditEvents).values({
        eventType: "training.started",
        projectId: input.projectId,
        trainingRunId: trainingRun.id,
        actor: ctx.user.id,
        phase: input.phase,
        action: "start_training",
        payload: { trainingType: input.trainingType, framework: input.framework },
        status: "success",
      });

      const job = await jobQueue.enqueue(
        "training",
        {
          trainingRunId: trainingRun.id,
          config: input.config,
          datasetIds: input.datasetIds,
          framework: input.framework,
        },
        {
          projectId: input.projectId,
          trainingRunId: trainingRun.id,
          userId: ctx.user.id,
        }
      );

      console.log(`[LLM Router] Training job ${job.id} enqueued for training run ${trainingRun.id}`);

      return { ...trainingRun, jobId: job.id };
    }),

  updateTrainingRun: governedProcedure
    .input(
      z.object({
        trainingRunId: z.number(),
        status: z.string().optional(),
        progress: z.number().min(0).max(100).optional(),
        currentStep: z.number().optional(),
        totalSteps: z.number().optional(),
        metrics: z.any().optional(),
        finalLoss: z.number().optional(),
        checkpointPath: z.string().optional(),
        loraAdapterPath: z.string().optional(),
        logs: z.string().optional(),
        errorMessage: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, updateTable, eq } = await import("../db");
      const { llmTrainingRuns } = await import("../../drizzle/schema");

      const { trainingRunId, ...updates } = input;

      const updateData: any = { ...updates, updatedAt: new Date() };

      if (updates.status === "completed") {
        updateData.completedAt = new Date();
      } else if (updates.status === "failed") {
        updateData.failedAt = new Date();
      } else if (updates.status === "running" && !updateData.startedAt) {
        updateData.startedAt = new Date();
      }

      const [updated] = await updateTable(llmTrainingRuns)
        .set(updateData)
        .where(eq(llmTrainingRuns.id, trainingRunId))
        .returning();

      return updated;
    }),

  createEvaluation: governedProcedure
    .input(
      z.object({
        projectId: z.number(),
        trainingRunId: z.number().optional(),
        modelPath: z.string().max(512),
        modelType: z.enum(["base", "sft", "dpo", "quantized"]),
        evalDatasetId: z.number().optional(),
        benchmarks: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, insertInto } = await import("../db");
      const { llmEvaluations, llmCreationAuditEvents } = await import("../../drizzle/schema");

      const [evaluation] = await insertInto(llmEvaluations)
        .values({
          ...input,
          results: {},
          status: "pending",
          createdBy: ctx.user.id,
        })
        .returning();

      await insertInto(llmCreationAuditEvents).values({
        eventType: "evaluation.created",
        projectId: input.projectId,
        evaluationId: evaluation.id,
        actor: ctx.user.id,
        phase: "phase_6_evaluation",
        action: "create_evaluation",
        payload: { modelType: input.modelType, benchmarks: input.benchmarks },
        status: "success",
      });

      const job = await jobQueue.enqueue(
        "evaluation",
        {
          evaluationId: evaluation.id,
          modelPath: input.modelPath,
          modelType: input.modelType,
          benchmarks: input.benchmarks || ["mmlu", "hellaswag", "arc", "truthfulqa", "gsm8k"],
        },
        {
          projectId: input.projectId,
          evaluationId: evaluation.id,
          userId: ctx.user.id,
        }
      );

      console.log(`[LLM Router] Evaluation job ${job.id} enqueued for evaluation ${evaluation.id}`);

      return { ...evaluation, jobId: job.id };
    }),

  updateEvaluation: governedProcedure
    .input(
      z.object({
        evaluationId: z.number(),
        status: z.string().optional(),
        results: z.any().optional(),
        overallScore: z.number().optional(),
        taskAccuracy: z.number().optional(),
        formatCorrectness: z.number().optional(),
        refusalCorrectness: z.number().optional(),
        latency: z.number().optional(),
        throughput: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, updateTable, eq } = await import("../db");
      const { llmEvaluations } = await import("../../drizzle/schema");

      const { evaluationId, ...updates } = input;

      const updateData: any = { updatedAt: new Date() };

      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.results !== undefined) updateData.results = updates.results;

      if (updates.overallScore !== undefined) updateData.overallScore = String(updates.overallScore);
      if (updates.taskAccuracy !== undefined) updateData.taskAccuracy = String(updates.taskAccuracy);
      if (updates.formatCorrectness !== undefined) updateData.formatCorrectness = String(updates.formatCorrectness);
      if (updates.refusalCorrectness !== undefined) updateData.refusalCorrectness = String(updates.refusalCorrectness);
      if (updates.throughput !== undefined) updateData.throughput = String(updates.throughput);

      if (updates.latency !== undefined) updateData.latency = Math.round(updates.latency);

      if (updates.status === "completed") {
        updateData.completedAt = new Date();
      }

      const [updated] = await updateTable(llmEvaluations)
        .set(updateData)
        .where(eq(llmEvaluations.id, evaluationId))
        .returning();

      return updated;
    }),

  startQuantization: governedProcedure
    .input(
      z.object({
        projectId: z.number(),
        sourceTrainingRunId: z.number().optional(),
        sourceModelPath: z.string().max(512),
        quantizationType: z.enum(["Q4_K_M", "Q5_K_M", "Q8_0", "Q2_K", "f16"]),
        method: z.enum(["llama.cpp", "gptq", "awq"]).optional(),
        outputPath: z.string().max(512).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, insertInto } = await import("../db");
      const { llmQuantizations, llmCreationAuditEvents } = await import("../../drizzle/schema");

      const [quantization] = await insertInto(llmQuantizations)
        .values({
          ...input,
          method: input.method || "llama.cpp",
          outputFormat: "gguf",
          status: "pending",
          createdBy: ctx.user.id,
        })
        .returning();

      await insertInto(llmCreationAuditEvents).values({
        eventType: "quantization.started",
        projectId: input.projectId,
        quantizationId: quantization.id,
        actor: ctx.user.id,
        phase: "phase_7_quantization",
        action: "start_quantization",
        payload: { quantizationType: input.quantizationType, method: input.method },
        status: "success",
      });

      const job = await jobQueue.enqueue(
        "quantization",
        {
          quantizationId: quantization.id,
          sourceModelPath: input.sourceModelPath,
          quantizationType: input.quantizationType,
          method: input.method || "llama.cpp",
          outputPath: input.outputPath,
        },
        {
          projectId: input.projectId,
          quantizationId: quantization.id,
          userId: ctx.user.id,
        }
      );

      console.log(`[LLM Router] Quantization job ${job.id} enqueued for quantization ${quantization.id}`);

      return { ...quantization, jobId: job.id };
    }),

  updateQuantization: governedProcedure
    .input(
      z.object({
        quantizationId: z.number(),
        status: z.string().optional(),
        outputPath: z.string().optional(),
        fileSize: z.number().optional(),
        accuracyDrop: z.number().optional(),
        compressionRatio: z.number().optional(),
        logs: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { db, updateTable, eq } = await import("../db");
      const { llmQuantizations } = await import("../../drizzle/schema");

      const { quantizationId, ...updates } = input;

      const updateData: any = { ...updates };

      if (updates.status === "completed") {
        updateData.completedAt = new Date();
      }

      const [updated] = await updateTable(llmQuantizations)
        .set(updateData)
        .where(eq(llmQuantizations.id, quantizationId))
        .returning();

      return updated;
    }),

  getCreationAuditTrail: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const { db } = await import("../db");
      const { llmCreationAuditEvents } = await import("../../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");

      return await db
        .select()
        .from(llmCreationAuditEvents)
        .where(eq(llmCreationAuditEvents.projectId, input.projectId))
        .orderBy(desc(llmCreationAuditEvents.timestamp));
    }),

  // ============================================================================
  // Job Queue & Training Orchestration
  // ============================================================================

  getJobStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = jobQueue.getJob(input.jobId);
      if (!job) {
        throw new Error("Job not found");
      }
      return job;
    }),

  listJobs: protectedProcedure
    .input(
      z
        .object({
          type: z.enum(["training", "evaluation", "quantization", "dataset_validation"]).optional(),
          status: z.enum(["pending", "running", "completed", "failed", "cancelled"]).optional(),
          projectId: z.number().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      let jobs = jobQueue.getJobs({
        type: input?.type,
        status: input?.status,
      });

      if (input?.projectId) {
        jobs = jobs.filter((job) => job.metadata?.projectId === input.projectId);
      }

      return jobs;
    }),

  cancelJob: governedProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ input }) => {
      const job = await jobQueue.cancelJob(input.jobId);
      return { success: true, job };
    }),

  getQueueStats: protectedProcedure.query(async () => {
    return jobQueue.getStats();
  }),

  pauseTraining: governedProcedure
    .input(z.object({ trainingRunId: z.number() }))
    .mutation(async ({ input }) => {
      const jobs = jobQueue.getJobs({ type: "training", status: "running" });
      const job = jobs.find((j) => j.metadata?.trainingRunId === input.trainingRunId);

      if (!job) {
        throw new Error("Training job not found or not running");
      }

      await jobQueue.cancelJob(job.id);

      return { success: true, message: "Training paused (cancelled)" };
    }),
} as const;
