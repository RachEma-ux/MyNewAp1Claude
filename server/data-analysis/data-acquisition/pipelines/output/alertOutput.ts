/**
 * Output pipeline — Alerts.
 *
 * Records an output run with `outputType: "alerts"` and emits the
 * `outputPipelineCompleted` event. Alert sinks (PagerDuty / Slack /
 * email) are configured per-workspace; the worker handles the actual
 * delivery via `/output`. Same degraded-vs-failed pattern.
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

export interface AlertOutputInput {
  workspaceId: number;
  canonicalRecordId?: number;
  itemId?: number;
  targetRef?: string;
  severity?: "low" | "medium" | "high";
  payload?: Record<string, unknown>;
}

export async function emitAlertOutput(input: AlertOutputInput): Promise<{
  id: number;
  status: "completed" | "degraded" | "failed";
  errorMessage?: string;
}> {
  const { id } = await recordOutputRun({
    workspaceId: input.workspaceId,
    itemId: input.itemId,
    canonicalRecordId: input.canonicalRecordId,
    outputType: "alerts",
    targetRef: input.targetRef,
  });
  try {
    const out = await callWorkerOutput({
      outputType: "alerts",
      canonicalRecordId: input.canonicalRecordId,
      itemId: input.itemId,
      targetRef: input.targetRef,
      payload: { severity: input.severity ?? "medium", ...input.payload },
    });
    if (out.status === "completed") {
      await markOutputRunCompleted(id, out.targetRef ?? input.targetRef);
      return { id, status: "completed" };
    }
    if (out.status === "degraded") {
      await markOutputRunDegraded(id, out.message ?? "Worker reported degraded alert output");
      return { id, status: "degraded", errorMessage: out.message };
    }
    await markOutputRunFailed(id, out.message ?? "Worker reported failed alert output");
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
