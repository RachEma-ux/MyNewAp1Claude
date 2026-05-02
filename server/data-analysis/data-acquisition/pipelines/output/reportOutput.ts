/**
 * Output pipeline — Reports.
 *
 * Records an output run with `outputType: "reports"`. The worker
 * generates the report (PDF/HTML/markdown) and writes it to the
 * configured target. We never inline the report bytes — only the
 * `targetRef` (e.g. an object-storage URL or `report_id`).
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

export interface ReportOutputInput {
  workspaceId: number;
  canonicalRecordId?: number;
  itemId?: number;
  targetRef?: string;
  format?: "pdf" | "html" | "markdown";
  payload?: Record<string, unknown>;
}

export async function emitReportOutput(input: ReportOutputInput): Promise<{
  id: number;
  status: "completed" | "degraded" | "failed";
  errorMessage?: string;
}> {
  const outputType = input.format
    ? input.format === "pdf"
      ? "pdf"
      : input.format === "html"
        ? "html"
        : "markdown"
    : "reports";
  const { id } = await recordOutputRun({
    workspaceId: input.workspaceId,
    itemId: input.itemId,
    canonicalRecordId: input.canonicalRecordId,
    outputType: outputType as
      | "rag"
      | "graphrag"
      | "analytics"
      | "warehouse"
      | "alerts"
      | "reports"
      | "markdown"
      | "html"
      | "pdf",
    targetRef: input.targetRef,
  });
  try {
    const out = await callWorkerOutput({
      outputType,
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
      await markOutputRunDegraded(id, out.message ?? "Worker reported degraded report output");
      return { id, status: "degraded", errorMessage: out.message };
    }
    await markOutputRunFailed(id, out.message ?? "Worker reported failed report output");
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
