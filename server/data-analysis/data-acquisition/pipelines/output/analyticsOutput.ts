/**
 * Output pipeline — Analytics.
 *
 * Hands the canonical record to the worker's `/output` capability with
 * `outputType: "analytics"`. The worker is the only writer to the
 * analytics sink (BigQuery / DuckDB / etc.). Same degraded-vs-failed
 * semantics as ragOutput.
 */

import {
  callWorkerOutput,
  WorkerRpcError,
} from "../../dataAcquisition.worker";
import {
  markOutputRunCompleted,
  markOutputRunDegraded,
  markOutputRunFailed,
  recordOutputRun,
} from "./outputRunner";

export interface AnalyticsOutputInput {
  workspaceId: number;
  canonicalRecordId?: number;
  itemId?: number;
  targetRef?: string;
  payload?: Record<string, unknown>;
}

export async function emitAnalyticsOutput(input: AnalyticsOutputInput): Promise<{
  id: number;
  status: "completed" | "degraded" | "failed";
  errorMessage?: string;
}> {
  const { id } = await recordOutputRun({
    workspaceId: input.workspaceId,
    itemId: input.itemId,
    canonicalRecordId: input.canonicalRecordId,
    outputType: "analytics",
    targetRef: input.targetRef,
  });
  try {
    const out = await callWorkerOutput({
      outputType: "analytics",
      canonicalRecordId: input.canonicalRecordId,
      itemId: input.itemId,
      targetRef: input.targetRef,
      payload: input.payload,
    });
    if (out.status === "completed") {
      await markOutputRunCompleted(id, out.targetRef ?? input.targetRef);
      return { id, status: "completed" };
    }
    if (out.status === "degraded") {
      await markOutputRunDegraded(id, out.message ?? "Worker reported degraded analytics output");
      return { id, status: "degraded", errorMessage: out.message };
    }
    await markOutputRunFailed(id, out.message ?? "Worker reported failed analytics output");
    return { id, status: "failed", errorMessage: out.message };
  } catch (err) {
    const isUnreachable =
      err instanceof WorkerRpcError && (err.kind === "unreachable" || err.kind === "timeout");
    const msg = (err as Error).message;
    if (isUnreachable) {
      await markOutputRunDegraded(id, msg);
      return { id, status: "degraded", errorMessage: msg };
    }
    await markOutputRunFailed(id, msg);
    return { id, status: "failed", errorMessage: msg };
  }
}
