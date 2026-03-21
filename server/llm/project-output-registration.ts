import { createLLMVersionWithExecutor, desc, eq, getDb } from "../db";
import { LLMPolicyEngine } from "../policies/llm-policy-engine";
import {
  llms,
  llmAuditEvents,
  llmCreationProjects,
  llmDatasets,
  llmTrainingRuns,
  llmEvaluations,
  llmQuantizations,
  llmCreationAuditEvents,
  type LLMVersion,
} from "../../drizzle/schema";

export interface RegisterProjectOutputInput {
  projectId: number;
  actorId: number;
  environment: "sandbox" | "governed" | "production";
  config: Record<string, unknown>;
  evaluationThreshold: number;
  explicitApprovalReason?: string;
  useQuantizedArtifact: boolean;
  policyBundleRef?: string;
  policyHash?: string;
  changeNotes?: string;
}

function parseScore(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function registerProjectOutputAsLLMVersionCandidate(
  input: RegisterProjectOutputInput
): Promise<LLMVersion> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  return await db.transaction(async (tx) => {
    const [project] = await tx
      .select()
      .from(llmCreationProjects)
      .where(eq(llmCreationProjects.id, input.projectId));
  if (!project) {
    throw new Error("Creation project not found");
  }
  if (project.status !== "completed" || !project.completedAt) {
    throw new Error("Creation project must be completed before registering a governed LLM version");
  }

  // Create the governed LLM identity at handoff time if not already linked
  let llmId = project.llmId as number | null;
  if (!llmId) {
    const target = project.target as Record<string, unknown> | null;
    const useCaseRoleMap: Record<string, string> = {
      chat_assistant: "executor",
      enterprise_doc_qa: "executor",
      coding_helper: "executor",
      router: "router",
      agent: "planner",
    };
    const role = (target && typeof target.useCase === "string"
      ? useCaseRoleMap[target.useCase]
      : null) ?? "executor";

    const [newLlm] = await tx.insert(llms).values({
      name: project.name,
      description: `Governed LLM identity created during handoff for creation project #${project.id}`,
      role: role as any,
      createdBy: input.actorId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    llmId = newLlm.id;

    await tx.update(llmCreationProjects)
      .set({ llmId })
      .where(eq(llmCreationProjects.id, project.id));

    await tx.insert(llmAuditEvents).values({
      eventType: "llm.created",
      llmId,
      actor: input.actorId,
      actorType: "user",
      payload: { sourceProjectId: project.id, createdDuringHandoff: true },
      timestamp: new Date(),
    });
  }

  const datasets = await tx.select().from(llmDatasets).where(eq(llmDatasets.projectId, input.projectId));
  if (datasets.length === 0) {
    throw new Error("At least one validated dataset is required before registering a governed LLM version");
  }
  const invalidDataset = datasets.find((dataset) => dataset.validated !== true || dataset.status === "failed");
  if (invalidDataset) {
    throw new Error("Dataset " + invalidDataset.id + " has not passed validation");
  }

  const trainingRuns = await tx
    .select()
    .from(llmTrainingRuns)
    .where(eq(llmTrainingRuns.projectId, input.projectId))
    .orderBy(desc(llmTrainingRuns.completedAt), desc(llmTrainingRuns.createdAt));
  const completedTrainingRun = trainingRuns.find((run) => run.status === "completed" && !!run.completedAt);
  if (!completedTrainingRun) {
    throw new Error("Training must complete before registering a governed LLM version");
  }

  const evaluations = await tx
    .select()
    .from(llmEvaluations)
    .where(eq(llmEvaluations.projectId, input.projectId))
    .orderBy(desc(llmEvaluations.completedAt), desc(llmEvaluations.createdAt));
  const completedEvaluation = evaluations.find((evaluation) => evaluation.status === "completed" && !!evaluation.completedAt);
  if (!completedEvaluation) {
    throw new Error("A completed evaluation is required before registering a governed LLM version");
  }

  const overallScore = parseScore(completedEvaluation.overallScore);
  const hasThresholdPass = overallScore !== null && overallScore >= input.evaluationThreshold;
  if (!hasThresholdPass && !input.explicitApprovalReason) {
    throw new Error(
      "Evaluation score must meet the " + input.evaluationThreshold + " threshold or include an explicit approval reason"
    );
  }

  const quantizations = await tx
    .select()
    .from(llmQuantizations)
    .where(eq(llmQuantizations.projectId, input.projectId))
    .orderBy(desc(llmQuantizations.completedAt), desc(llmQuantizations.createdAt));
  const completedQuantization = quantizations.find(
    (quantization) => quantization.status === "completed" && !!quantization.outputPath
  );
  if (input.useQuantizedArtifact && !completedQuantization) {
    throw new Error("A completed quantization output is required when registering a quantized governed LLM version");
  }

  const artifactPath = input.useQuantizedArtifact
    ? completedQuantization?.outputPath ?? null
    : project.finalModelPath ?? completedTrainingRun.checkpointPath ?? completedTrainingRun.loraAdapterPath ?? null;
  if (!artifactPath) {
    throw new Error("Final artifact metadata is incomplete for the governed LLM version handoff");
  }

  // Look up LLM identity for policy evaluation
  const [llmRecord] = await tx.select().from(llms).where(eq(llms.id, llmId));
  if (!llmRecord) throw new Error("Linked LLM identity not found");

  // Evaluate policy before creating the governed version
  const policyResult = await LLMPolicyEngine.evaluate({
    identity: { name: llmRecord.name, role: llmRecord.role },
    configuration: input.config as any,
    environment: input.environment,
  });
  if (policyResult.decision === "deny") {
    throw new Error("Policy evaluation denied: " + policyResult.violations.map(v => v.message).join("; "));
  }

  const version = await createLLMVersionWithExecutor(tx, {
    llmId,
    environment: input.environment,
    config: {
      ...input.config,
      artifact: {
        path: artifactPath,
        quantized: input.useQuantizedArtifact,
        ollamaModelName: project.ollamaModelName ?? null,
      },
      provenance: {
        creationProjectId: project.id,
        datasetIds: datasets.map((dataset) => dataset.id),
        trainingRunId: completedTrainingRun.id,
        evaluationId: completedEvaluation.id,
        quantizationId: completedQuantization?.id ?? null,
        explicitApprovalReason: input.explicitApprovalReason ?? null,
      },
    },
    policyBundleRef: input.policyBundleRef,
    policyHash: policyResult.policyHash,
    policyDecision: policyResult.decision === "allow" ? "pass" : "warn",
    attestationStatus: "pending",
    driftStatus: "none",
    callable: false,
    createdBy: input.actorId,
    changeNotes:
      input.changeNotes ??
      "Registered from creation project " + project.id + " after training/evaluation handoff",
  });

  await tx.insert(llmCreationAuditEvents).values({
    eventType: "project.output.registered_as_llm_version",
    projectId: project.id,
    actor: input.actorId,
    phase: project.currentPhase ?? "phase_8_registration",
    action: "register_project_output_as_llm_version",
    payload: {
      llmId,
      llmVersionId: version.id,
      trainingRunId: completedTrainingRun.id,
      evaluationId: completedEvaluation.id,
      quantizationId: completedQuantization?.id ?? null,
      artifactPath,
      usedExplicitApproval: !hasThresholdPass,
      evaluationThreshold: input.evaluationThreshold,
    },
    status: "success",
  });

  return version;
  });
}
