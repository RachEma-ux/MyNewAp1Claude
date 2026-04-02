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
import { prepareWorkspace, finalizeWorkspace } from "./workspace-manager";

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
  if (details?.errorMessage) {
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
 * Start a job — queue it and initialize steps.
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
 * Retry a failed job — transition from failed back to queued.
 */
export async function retryJob(jobId: number) {
  return transitionJob(jobId, "queued", { errorMessage: null });
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
