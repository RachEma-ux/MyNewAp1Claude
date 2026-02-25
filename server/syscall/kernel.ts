/**
 * Syscall Kernel — The ONLY execution engine in the platform
 *
 * This module is the sole layer authorized to:
 *   - Execute filesystem operations
 *   - Access databases
 *   - Commit to Git / create PRs
 *   - Trigger CI pipelines
 *   - Upload artifacts
 *
 * No operator, router, or UI component may bypass this kernel.
 *
 * Execution pipeline per syscall:
 *   1. Zod validation of args
 *   2. Governance gate evaluation (deny-by-default)
 *   3. Adapter execution (if allowed)
 *   4. Evidence emission (always, regardless of outcome)
 *   5. Result aggregation
 */

import { v4 as uuidv4 } from "uuid";
import type {
  SyscallBatch,
  SyscallResult,
  ExecutionResult,
  AutonomyLevel,
  OperatorName,
  GovernanceDecision,
} from "@shared/operator-types";
import { validateSyscallArgs } from "./schemas";
import { evaluateSyscallGate } from "./governance-gate";
import { getAdapter } from "./adapters";
import type { AdapterContext } from "./types";

// ============================================================================
// Audit Logger (writes to DB via drizzle)
// ============================================================================

interface AuditEntry {
  traceId: string;
  jobId: string;
  operator: OperatorName;
  requestedBy: string;
  syscallIndex: number;
  action: string;
  argsHash: string;
  verdict: string;
  reason: string;
  durationMs: number;
  resultSummary: string;
  executedAt: string;
}

const auditBuffer: AuditEntry[] = [];

async function flushAuditBuffer(): Promise<void> {
  if (auditBuffer.length === 0) return;

  try {
    const { getDb } = await import("../db");
    const db = getDb();
    if (!db) return;

    const { operatorAuditLog } = await import("../../drizzle/tables/operator-runtime");
    const entries = auditBuffer.splice(0, auditBuffer.length);

    await db.insert(operatorAuditLog).values(
      entries.map((e) => ({
        traceId: e.traceId,
        jobId: e.jobId,
        operator: e.operator,
        requestedBy: e.requestedBy,
        syscallIndex: e.syscallIndex,
        action: e.action,
        argsHash: e.argsHash,
        verdict: e.verdict,
        reason: e.reason,
        durationMs: e.durationMs,
        resultSummary: e.resultSummary,
        executedAt: new Date(e.executedAt),
      }))
    );
  } catch (error) {
    // Audit failure must not block execution — log to stderr
    console.error("[SyscallKernel] Audit flush failed:", error);
  }
}

function hashArgs(args: Record<string, unknown>): string {
  const { createHash } = require("crypto");
  return createHash("sha256").update(JSON.stringify(args)).digest("hex").slice(0, 16);
}

// ============================================================================
// Kernel — execute a validated SyscallBatch
// ============================================================================

export async function executeSyscallBatch(
  batch: SyscallBatch,
  autonomyLevel: AutonomyLevel,
  requestedBy: string,
  workspaceId?: number,
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const traceId = `trace_${uuidv4().slice(0, 8)}`;
  const results: SyscallResult[] = [];

  let succeeded = 0;
  let failed = 0;
  let denied = 0;
  let skipped = 0;

  for (let i = 0; i < batch.plan.length; i++) {
    const syscall = batch.plan[i];
    const syscallStart = Date.now();

    // Step 1: Validate args via Zod
    let validatedArgs: Record<string, unknown>;
    try {
      validatedArgs = validateSyscallArgs(syscall.action, syscall.args);
    } catch (validationError: any) {
      const decision: GovernanceDecision = {
        verdict: "deny",
        reason: `Validation failed: ${validationError.message}`,
        policyRef: "zod-schema-validation",
        evaluatedAt: new Date().toISOString(),
        syscallIndex: i,
        action: syscall.action,
      };

      results.push({
        syscallIndex: i,
        action: syscall.action,
        status: "denied",
        governanceDecision: decision,
        error: validationError.message,
        durationMs: Date.now() - syscallStart,
        executedAt: new Date().toISOString(),
      });

      denied++;
      emitAudit(traceId, batch, i, syscall.action, syscall.args, decision, 0, "validation_denied");
      continue;
    }

    // Step 2: Governance gate
    const decision = evaluateSyscallGate(syscall, i, batch.operator, autonomyLevel);

    if (decision.verdict === "deny") {
      results.push({
        syscallIndex: i,
        action: syscall.action,
        status: "denied",
        governanceDecision: decision,
        error: decision.reason,
        durationMs: Date.now() - syscallStart,
        executedAt: new Date().toISOString(),
      });

      denied++;
      emitAudit(traceId, batch, i, syscall.action, validatedArgs, decision, 0, "governance_denied");
      continue;
    }

    // Step 3: Execute adapter
    const adapter = getAdapter(syscall.action);
    if (!adapter) {
      // Should never happen — governance gate already checked
      skipped++;
      continue;
    }

    const adapterCtx: AdapterContext = {
      jobId: batch.jobId,
      operator: batch.operator,
      traceId,
      workspaceId,
      autonomyLevel,
    };

    try {
      const adapterResult = await adapter.execute(validatedArgs, adapterCtx);
      const durationMs = Date.now() - syscallStart;

      results.push({
        syscallIndex: i,
        action: syscall.action,
        status: adapterResult.success ? "success" : "failed",
        governanceDecision: decision,
        output: adapterResult.output,
        error: adapterResult.error,
        durationMs,
        executedAt: new Date().toISOString(),
      });

      if (adapterResult.success) {
        succeeded++;
      } else {
        failed++;
      }

      emitAudit(traceId, batch, i, syscall.action, validatedArgs, decision, durationMs,
        adapterResult.success ? "executed_success" : "executed_failed");
    } catch (execError: any) {
      const durationMs = Date.now() - syscallStart;

      results.push({
        syscallIndex: i,
        action: syscall.action,
        status: "failed",
        governanceDecision: decision,
        error: execError.message,
        durationMs,
        executedAt: new Date().toISOString(),
      });

      failed++;
      emitAudit(traceId, batch, i, syscall.action, validatedArgs, decision, durationMs, "execution_error");
    }
  }

  // Flush audit entries to DB
  await flushAuditBuffer();

  return {
    jobId: batch.jobId,
    operator: batch.operator,
    results,
    totalDurationMs: Date.now() - startTime,
    completedAt: new Date().toISOString(),
    summary: {
      total: batch.plan.length,
      succeeded,
      failed,
      denied,
      skipped,
    },
  };
}

// ============================================================================
// Emit audit entry to buffer
// ============================================================================

function emitAudit(
  traceId: string,
  batch: SyscallBatch,
  index: number,
  action: string,
  args: Record<string, unknown>,
  decision: GovernanceDecision,
  durationMs: number,
  resultSummary: string,
): void {
  auditBuffer.push({
    traceId,
    jobId: batch.jobId,
    operator: batch.operator,
    requestedBy: batch.operator,
    syscallIndex: index,
    action,
    argsHash: hashArgs(args),
    verdict: decision.verdict,
    reason: decision.reason,
    durationMs,
    resultSummary,
    executedAt: new Date().toISOString(),
  });
}
