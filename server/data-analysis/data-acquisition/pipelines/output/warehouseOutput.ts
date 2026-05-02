/**
 * Output pipeline — Data Warehouse.
 *
 * Same shape as analyticsOutput, distinct outputType so warehouse
 * consumers can subscribe / filter independently. The Data Warehouse
 * subdomain inside Data Analysis owns the destination tables.
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

export interface WarehouseOutputInput {
  workspaceId: number;
  canonicalRecordId?: number;
  itemId?: number;
  targetRef?: string;
  payload?: Record<string, unknown>;
}

export async function emitWarehouseOutput(
  input: WarehouseOutputInput,
): Promise<{
  id: number;
  status: "completed" | "degraded" | "failed";
  errorMessage?: string;
}> {
  const { id } = await recordOutputRun({
    workspaceId: input.workspaceId,
    itemId: input.itemId,
    canonicalRecordId: input.canonicalRecordId,
    outputType: "warehouse",
    targetRef: input.targetRef,
  });
  try {
    const out = await callWorkerOutput({
      outputType: "warehouse",
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
      await markOutputRunDegraded(id, out.message ?? "Worker reported degraded warehouse output");
      return { id, status: "degraded", errorMessage: out.message };
    }
    await markOutputRunFailed(id, out.message ?? "Worker reported failed warehouse output");
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
