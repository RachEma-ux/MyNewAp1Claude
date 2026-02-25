/**
 * Orchestrator — Central job lifecycle manager
 *
 * Responsibilities:
 *   1. Accept Intent from user/API
 *   2. Route to operator deterministically
 *   3. Create OperatorJob
 *   4. Dispatch to operator for plan generation
 *   5. Send SyscallBatch to Kernel for execution
 *   6. Track execution results
 *   7. Update job status throughout lifecycle
 *   8. Persist all state to database
 */

import { v4 as uuidv4 } from "uuid";
import type {
  Intent,
  OperatorJob,
  OperatorName,
  SyscallBatch,
  ExecutionResult,
  AutonomyLevel,
  JobStatus,
  OperatorConstraints,
} from "@shared/operator-types";
import { OPERATOR_CAPABILITIES } from "@shared/operator-types";
import { routeIntent } from "./intent-router";
import { getOperator } from "../operators/registry";
import { executeSyscallBatch } from "../syscall/kernel";

// ============================================================================
// In-memory job store (backed by DB via flush)
// ============================================================================

const jobStore = new Map<string, OperatorJob>();

// ============================================================================
// Job Persistence
// ============================================================================

async function persistJob(job: OperatorJob): Promise<void> {
  jobStore.set(job.jobId, { ...job });

  try {
    const { getDb } = await import("../db");
    const db = getDb();
    if (!db) return;

    const { operatorJobs } = await import("../../drizzle/tables/operator-runtime");
    const { eq } = await import("drizzle-orm");

    const existing = await db.select({ id: operatorJobs.jobId })
      .from(operatorJobs)
      .where(eq(operatorJobs.jobId, job.jobId))
      .limit(1);

    if (existing.length > 0) {
      await db.update(operatorJobs)
        .set({
          status: job.status,
          updatedAt: new Date(),
          resultJson: job.result ? JSON.stringify(job.result) : null,
          executionResultJson: job.executionResult ? JSON.stringify(job.executionResult) : null,
          error: job.error,
        })
        .where(eq(operatorJobs.jobId, job.jobId));
    } else {
      await db.insert(operatorJobs).values({
        jobId: job.jobId,
        operator: job.operator,
        intentDescription: job.intent.description,
        intentJson: JSON.stringify(job.intent),
        constraintsJson: JSON.stringify(job.constraints),
        status: job.status,
        traceId: job.traceId,
        requestedBy: job.intent.requestedBy,
        workspaceId: job.intent.workspaceId || null,
        createdAt: new Date(job.createdAt),
        updatedAt: new Date(job.updatedAt),
      });
    }
  } catch (error) {
    console.error("[Orchestrator] Job persist failed:", error);
  }
}

// ============================================================================
// Build constraints from operator capabilities
// ============================================================================

function buildConstraints(operator: OperatorName, autonomyLevel: AutonomyLevel): OperatorConstraints {
  const cap = OPERATOR_CAPABILITIES[operator];
  const effectiveAutonomy = Math.min(autonomyLevel, cap.maxAutonomyLevel) as AutonomyLevel;

  return {
    maxSyscalls: 50,
    allowedActions: cap.allowedActions,
    deniedActions: cap.deniedActions,
    maxTokens: 8192,
    temperature: operator === "governance" ? 0.1 : operator === "auditor" ? 0.3 : 0.5,
    autonomyLevel: effectiveAutonomy,
    timeoutMs: 60_000,
  };
}

// ============================================================================
// Orchestrator — Main API
// ============================================================================

/**
 * Submit an intent for processing.
 * Returns the completed OperatorJob with execution results.
 */
export async function submitIntent(intent: Intent): Promise<OperatorJob> {
  // 1. Route intent to operator
  const operatorName = routeIntent(intent);

  // 2. Build job
  const jobId = `job_${uuidv4().slice(0, 12)}`;
  const traceId = `trace_${uuidv4().slice(0, 8)}`;
  const constraints = buildConstraints(operatorName, intent.autonomyLevel);

  const job: OperatorJob = {
    jobId,
    operator: operatorName,
    intent,
    constraints,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    traceId,
    result: null,
    executionResult: null,
    error: null,
  };

  await persistJob(job);

  // 3. Route to operator for plan generation
  try {
    job.status = "routing";
    job.updatedAt = new Date().toISOString();
    await persistJob(job);

    job.status = "generating";
    job.updatedAt = new Date().toISOString();
    await persistJob(job);

    const operator = getOperator(operatorName);
    const batch: SyscallBatch = await operator.generatePlan(job);

    job.result = batch;
    job.status = "validating";
    job.updatedAt = new Date().toISOString();
    await persistJob(job);

    // 4. Execute via kernel (if autonomy level > 0)
    if (intent.autonomyLevel > 0) {
      job.status = "executing";
      job.updatedAt = new Date().toISOString();
      await persistJob(job);

      const executionResult: ExecutionResult = await executeSyscallBatch(
        batch,
        constraints.autonomyLevel,
        intent.requestedBy,
        intent.workspaceId,
      );

      job.executionResult = executionResult;
      job.status = executionResult.summary.failed > 0 ? "failed" : "completed";
      job.updatedAt = new Date().toISOString();
      await persistJob(job);
    } else {
      // Plan-only mode (autonomy level 0)
      job.status = "completed";
      job.updatedAt = new Date().toISOString();
      await persistJob(job);
    }
  } catch (error: any) {
    job.status = "failed";
    job.error = error.message;
    job.updatedAt = new Date().toISOString();
    await persistJob(job);
  }

  return job;
}

/**
 * Get a job by ID.
 */
export function getJob(jobId: string): OperatorJob | undefined {
  return jobStore.get(jobId);
}

/**
 * List all jobs (most recent first).
 */
export function listJobs(limit: number = 50): OperatorJob[] {
  const all = Array.from(jobStore.values());
  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return all.slice(0, limit);
}

/**
 * List jobs by operator.
 */
export function listJobsByOperator(operator: OperatorName, limit: number = 50): OperatorJob[] {
  return listJobs(limit * 2).filter((j) => j.operator === operator).slice(0, limit);
}
