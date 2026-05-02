/**
 * Output pipeline — GraphRAG.
 *
 * Data Acquisition does NOT call GraphRAG service code directly — it
 * records an output run and emits `outputPipelineCompleted` with
 * `outputType: "graphrag"`. The GraphRAG subdomain (also under Data
 * Analysis) subscribes to that event and ingests the canonical record.
 *
 * This boundary is part of the spec: cross-subdomain integration is
 * event-driven so neither subdomain has to import the other's private
 * code.
 */

import {
  markOutputRunCompleted,
  recordOutputRun,
} from "./outputRunner";

export interface GraphRagOutputInput {
  workspaceId: number;
  canonicalRecordId?: number;
  itemId?: number;
  targetRef?: string;
}

/**
 * Record the output run and return its id. The caller emits
 * `outputPipelineCompleted` with `{ outputType: "graphrag" }`. GraphRAG's
 * subscriber owns the actual ingest. We do NOT mark `completed` until
 * we've recorded the request — the event is the contract.
 */
export async function emitGraphRagOutput(input: GraphRagOutputInput): Promise<{
  id: number;
  status: "completed";
}> {
  const { id } = await recordOutputRun({
    workspaceId: input.workspaceId,
    itemId: input.itemId,
    canonicalRecordId: input.canonicalRecordId,
    outputType: "graphrag",
    targetRef: input.targetRef,
  });
  await markOutputRunCompleted(id, input.targetRef);
  return { id, status: "completed" };
}
