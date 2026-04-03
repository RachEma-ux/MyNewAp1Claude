/**
 * Code Studio — Job Orchestrator
 *
 * Owns the coding job state machine. Transitions jobs through the
 * standard workflow: prepare → plan → approve → build → review → test → governance → complete.
 *
 * OpenCode operates within each phase but Code Studio owns the state machine.
 */

import { JOB_STATUS_TRANSITIONS, type JobStatus, type AgentRole } from "../shared/constants";
import * as repo from "../repository";
import * as ocClient from "../opencode/client";
import { prepareWorkspace, finalizeWorkspace, getWorkspaceByJobId } from "./workspace-manager";

export class JobOrchestrationError extends Error {
  constructor(message: string, public jobId: number, public phase?: string) {
    super(message);
    this.name = "JobOrchestrationError";
  }
}

/**
 * Validate a job status transition.
 */
export function canTransition(from: string, to: string): boolean {
  const allowed = JOB_STATUS_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Transition a job to a new status with validation.
 */
export async function transitionJob(jobId: number, newStatus: JobStatus, details?: Record<string, any>) {
  const job = await repo.getJobById(jobId);
  if (!job) throw new JobOrchestrationError(`Job ${jobId} not found`, jobId);

  if (!canTransition(job.status, newStatus)) {
    throw new JobOrchestrationError(
      `Invalid transition: ${job.status} → ${newStatus}`,
      jobId,
      job.status
    );
  }

  const updateData: Record<string, any> = { status: newStatus };
  if (newStatus === "completed" || newStatus === "failed" || newStatus === "cancelled") {
    updateData.completedAt = new Date();
  }
  if (details && "errorMessage" in details) {
    updateData.errorMessage = details.errorMessage;
  }

  const updated = await repo.updateJob(jobId, updateData);

  await repo.createAuditEvent({
    eventType: "job_status_changed",
    entityType: "job",
    entityId: jobId,
    details: { from: job.status, to: newStatus, ...details },
  });

  return updated;
}

/**
 * Standard workflow step definitions for a coding job.
 */
const STANDARD_STEPS: { name: string; order: number; agentRole: AgentRole }[] = [
  { name: "prepare_workspace", order: 1, agentRole: "coding-orchestrator" },
  { name: "planning", order: 2, agentRole: "planner" },
  { name: "building", order: 3, agentRole: "builder" },
  { name: "reviewing", order: 4, agentRole: "reviewer" },
  { name: "testing", order: 5, agentRole: "tester" },
  { name: "governance_check", order: 6, agentRole: "governance" },
];

/**
 * Initialize standard workflow steps for a job.
 */
export async function initializeJobSteps(jobId: number) {
  const steps = [];
  for (const step of STANDARD_STEPS) {
    const created = await repo.createJobStep({
      jobId,
      stepName: step.name,
      stepOrder: step.order,
      agentRole: step.agentRole,
    });
    steps.push(created);
  }
  return steps;
}

/**
 * Start a job — queue it, initialize steps, and kick off async execution.
 */
export async function startJob(jobId: number) {
  const job = await repo.getJobById(jobId);
  if (!job) throw new JobOrchestrationError(`Job ${jobId} not found`, jobId);

  // Initialize steps
  await initializeJobSteps(jobId);

  // Transition to queued
  await transitionJob(jobId, "queued");

  await repo.createAuditEvent({
    eventType: "job_started",
    entityType: "job",
    entityId: jobId,
    actorUserId: job.actorUserId ?? undefined,
  });

  // Fire-and-forget: execute the job asynchronously
  executeJob(jobId).catch((err) => {
    console.error(`[CodeStudio] executeJob(${jobId}) unhandled error:`, err);
  });

  return repo.getJobById(jobId);
}

/**
 * Cancel a job.
 */
export async function cancelJob(jobId: number, actorUserId?: number) {
  const updated = await transitionJob(jobId, "cancelled");

  await repo.createAuditEvent({
    eventType: "job_cancelled",
    entityType: "job",
    entityId: jobId,
    actorUserId,
  });

  return updated;
}

/**
 * Retry a failed job — reset steps, transition to queued, and re-execute.
 */
export async function retryJob(jobId: number) {
  // Reset all step statuses to pending
  const steps = await repo.listJobSteps(jobId);
  for (const step of steps) {
    await repo.updateJobStep(step.id, { status: "pending", output: null });
  }

  const updated = await transitionJob(jobId, "queued", { errorMessage: null });

  // Fire-and-forget: re-execute
  executeJob(jobId).catch((err) => {
    console.error(`[CodeStudio] executeJob(${jobId}) retry error:`, err);
  });

  return updated;
}

/**
 * Check OpenCode runtime health and return status.
 */
export async function checkRuntimeHealth() {
  const ocHealth = await ocClient.checkHealth();
  const dbHealth = await repo.getHealthSummary();

  return {
    opencode: ocHealth,
    codedb: dbHealth,
    overall: ocHealth.healthy && dbHealth.connected,
  };
}

/**
 * Build evidence bundle for a completed job.
 */
export async function buildEvidenceBundle(jobId: number) {
  const job = await repo.getJobById(jobId);
  if (!job) return null;

  const steps = await repo.listJobSteps(jobId);
  const diffs = await repo.listDiffs(jobId);
  const artifacts = await repo.listArtifacts(jobId);
  const auditEvents = await repo.listAuditEvents({ entityType: "job", entityId: jobId });

  const bundle = {
    jobId,
    title: job.title,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    steps: steps.map(s => ({ name: s.stepName, status: s.status, agentRole: s.agentRole })),
    diffSummary: {
      totalFiles: diffs.length,
      added: diffs.filter(d => d.diffType === "add").length,
      modified: diffs.filter(d => d.diffType === "modify").length,
      deleted: diffs.filter(d => d.diffType === "delete").length,
    },
    artifacts: artifacts.map(a => ({ type: a.artifactType, name: a.name })),
    auditEventCount: auditEvents.length,
    generatedAt: new Date().toISOString(),
  };

  // Persist as artifact
  await repo.createArtifact({
    jobId,
    artifactType: "evidence_bundle",
    name: `evidence-bundle-job-${jobId}`,
    content: JSON.stringify(bundle, null, 2),
    metadata: { generatedAt: bundle.generatedAt },
  });

  return bundle;
}

// ── Phase Prompt Builders ────────────────────────────────────────────────────

function buildPhasePrompt(job: any, phase: string): string {
  const objective = job.objective || job.description || job.title;
  const constraints = job.constraints
    ? `\nConstraints: ${JSON.stringify(job.constraints)}`
    : "";

  switch (phase) {
    case "planning":
      return `You are the Planner agent for Code Studio Job #${job.id}.\n\nObjective: ${objective}${constraints}\n\nAnalyze the codebase and produce a detailed implementation plan. List files to modify, approach, risks, and validation steps.`;
    case "building":
      return `You are the Builder agent for Code Studio Job #${job.id}.\n\nObjective: ${objective}${constraints}\n\nImplement the planned changes. Follow existing patterns and conventions.`;
    case "reviewing":
      return `You are the Reviewer agent for Code Studio Job #${job.id}.\n\nObjective: ${objective}\n\nReview all changes for correctness, security, and adherence to project conventions. Report any issues.`;
    case "testing":
      return `You are the Tester agent for Code Studio Job #${job.id}.\n\nObjective: ${objective}\n\nRun relevant tests and verify the implementation meets the objective. Report pass/fail status.`;
    case "governance_check":
      return `You are the Governance agent for Code Studio Job #${job.id}.\n\nObjective: ${objective}\n\nVerify changes comply with project policies, security requirements, and coding standards.`;
    default:
      return `Execute phase: ${phase}\n\nObjective: ${objective}`;
  }
}

/**
 * Execute a job through the full workflow pipeline.
 * Called asynchronously (fire-and-forget) from startJob / retryJob.
 */
export async function executeJob(jobId: number): Promise<void> {
  try {
    const job = await repo.getJobById(jobId);
    if (!job || job.status !== "queued") return;

    // ── Pre-flight: check OpenCode health ──────────────────────────────
    const health = await ocClient.checkHealth();
    if (!health.healthy) {
      await transitionJob(jobId, "failed", {
        errorMessage:
          "OpenCode runtime is offline. Start OpenCode (opencode serve) and retry the job.",
      });
      await repo.createAuditEvent({
        eventType: "execution_failed",
        entityType: "job",
        entityId: jobId,
        details: { reason: "opencode_offline" },
      });
      return;
    }

    // ── Step 1: Prepare workspace ──────────────────────────────────────
    await transitionJob(jobId, "preparing_workspace");
    const steps = await repo.listJobSteps(jobId);
    const prepStep = steps.find((s: any) => s.stepName === "prepare_workspace");
    if (prepStep) await repo.updateJobStep(prepStep.id, { status: "in_progress" });

    if (job.repoId) {
      try {
        await prepareWorkspace(jobId, job.repoId);
      } catch (err: any) {
        if (prepStep)
          await repo.updateJobStep(prepStep.id, { status: "failed", output: err.message });
        await transitionJob(jobId, "failed", {
          errorMessage: `Workspace preparation failed: ${err.message}`,
        });
        return;
      }
    }
    if (prepStep) await repo.updateJobStep(prepStep.id, { status: "completed" });

    // ── Step 2: Start OpenCode session ─────────────────────────────────
    await transitionJob(jobId, "starting_session");
    let ocSessionId: string;
    try {
      const ocSession = await ocClient.createSession(`Job #${jobId}: ${job.title}`);
      ocSessionId = ocSession.id;
    } catch (err: any) {
      await transitionJob(jobId, "failed", {
        errorMessage: `Failed to create OpenCode session: ${err.message}`,
      });
      return;
    }

    // Record session in CODEDB
    await repo.createSession({
      jobId,
      opencodeSessionId: ocSessionId,
      agentRole: "coding-orchestrator",
    });

    await repo.createAuditEvent({
      eventType: "session_created",
      entityType: "job",
      entityId: jobId,
      details: { opencodeSessionId: ocSessionId },
    });

    // ── Steps 3-6: Execute agent phases ────────────────────────────────
    const phaseMap: { stepName: string; jobStatus: JobStatus }[] = [
      { stepName: "planning", jobStatus: "planning" },
      { stepName: "building", jobStatus: "building" },
      { stepName: "reviewing", jobStatus: "reviewing" },
      { stepName: "testing", jobStatus: "testing" },
      { stepName: "governance_check", jobStatus: "governance_check" },
    ];

    for (const phase of phaseMap) {
      // Check if job was cancelled mid-execution
      const currentJob = await repo.getJobById(jobId);
      if (!currentJob || currentJob.status === "cancelled") return;

      await transitionJob(jobId, phase.jobStatus);
      const step = steps.find((s: any) => s.stepName === phase.stepName);
      if (step) await repo.updateJobStep(step.id, { status: "in_progress" });

      try {
        const prompt = buildPhasePrompt(job, phase.stepName);
        await ocClient.sendMessage(ocSessionId, prompt);
        if (step) await repo.updateJobStep(step.id, { status: "completed" });
      } catch (err: any) {
        if (step)
          await repo.updateJobStep(step.id, { status: "failed", output: err.message });
        await transitionJob(jobId, "failed", {
          errorMessage: `${phase.stepName} failed: ${err.message}`,
        });
        return;
      }
    }

    // ── Complete ──────────────────────────────────────────────────────
    await transitionJob(jobId, "completed");

    // Finalize workspace if one was created
    if (job.repoId) {
      try {
        const ws = await getWorkspaceByJobId(jobId);
        if (ws) await finalizeWorkspace(ws.id, "head", []);
      } catch {
        /* non-fatal */
      }
    }

    // Build evidence bundle
    try {
      await buildEvidenceBundle(jobId);
    } catch {
      /* non-fatal */
    }

    await repo.createAuditEvent({
      eventType: "job_completed",
      entityType: "job",
      entityId: jobId,
    });
  } catch (err: any) {
    // Catch-all: fail the job gracefully
    try {
      const currentJob = await repo.getJobById(jobId);
      if (
        currentJob &&
        !["completed", "failed", "cancelled"].includes(currentJob.status)
      ) {
        await transitionJob(jobId, "failed", {
          errorMessage: `Unexpected execution error: ${err.message}`,
        });
      }
    } catch {
      console.error(`[CodeStudio] Failed to mark job ${jobId} as failed:`, err);
    }
  }
}
