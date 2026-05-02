/**
 * Output pipeline — RAG.
 *
 * Records an `outputType: "rag"` run. Hands the canonical record over
 * to the worker's `/output` capability, which is responsible for the
 * RAG ingest. If the worker is unreachable, the run is marked
 * `degraded` (UI shows banner) — never `completed`-with-fake-success.
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

export interface RagOutputInput {
  workspaceId: number;
  canonicalRecordId?: number;
  itemId?: number;
  targetRef?: string;
  payload?: Record<string, unknown>;
}

export async function emitRagOutput(input: RagOutputInput): Promise<{
  id: number;
  status: "completed" | "degraded" | "failed";
  errorMessage?: string;
}> {
  const { id } = await recordOutputRun({
    workspaceId: input.workspaceId,
    itemId: input.itemId,
    canonicalRecordId: input.canonicalRecordId,
    outputType: "rag",
    targetRef: input.targetRef,
  });
  try {
    const out = await callWorkerOutput({
      outputType: "rag",
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
      await markOutputRunDegraded(id, out.message ?? "Worker reported degraded RAG output");
      return { id, status: "degraded", errorMessage: out.message };
    }
    await markOutputRunFailed(id, out.message ?? "Worker reported failed RAG output");
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
