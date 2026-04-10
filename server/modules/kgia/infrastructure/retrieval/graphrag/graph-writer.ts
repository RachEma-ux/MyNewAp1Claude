/**
 * GraphRAG — Graph Writer
 *
 * Writes extracted entities and relations to the retrieval graph store.
 * V1: Writes to PostgreSQL (kgia_ingestion_chunks with entity/relation JSON).
 * Future: Write to dedicated graph store (Neo4j/Neptune).
 */

import { getDb } from "../../../../db/connection";
import { kgiaIngestionChunks } from "../../../schema";

export interface GraphWritePayload {
  workspaceId: number;
  ingestionId: number;
  documentName: string;
  chunkIndex: number;
  content: string;
  entities: string[];
  relations: Array<{ subject: string; predicate: string; object: string }>;
}

/**
 * Write a processed chunk with its entities and relations.
 */
export async function writeChunkToGraph(payload: GraphWritePayload): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db.insert(kgiaIngestionChunks).values({
    workspaceId: payload.workspaceId,
    ingestionId: payload.ingestionId,
    documentName: payload.documentName,
    chunkIndex: payload.chunkIndex,
    content: payload.content,
    entities: payload.entities,
    relations: payload.relations as any,
  });
}

/**
 * Write a batch of chunks.
 */
export async function writeBatchToGraph(payloads: GraphWritePayload[]): Promise<number> {
  let written = 0;
  for (const payload of payloads) {
    await writeChunkToGraph(payload);
    written++;
  }
  return written;
}
