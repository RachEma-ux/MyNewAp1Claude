/**
 * KGIA — GraphRAG Coordinator
 *
 * Orchestrates the GraphRAG ingestion pipeline:
 * document loading → chunking → entity/relation extraction →
 * entity resolution → chunk persistence.
 *
 * V1: Basic entity extraction from text chunks. Community clustering
 * and community reports deferred to V2.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../../db/connection";
import { kgiaIngestions, kgiaIngestionChunks } from "../schema";
import { resolveEntities, type RawEntity } from "./entity-resolver";

export interface IngestionParams {
  workspaceId: number;
  sourceId?: number;
  name: string;
  documents: Array<{ name: string; content: string }>;
  config?: {
    chunkSize?: number;
    chunkOverlap?: number;
  };
}

export interface IngestionResult {
  ingestionId: number;
  status: string;
  documentCount: number;
  chunkCount: number;
  entityCount: number;
  relationCount: number;
}

/**
 * Start a GraphRAG ingestion run.
 */
export async function startIngestion(
  params: IngestionParams
): Promise<IngestionResult> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const chunkSize = params.config?.chunkSize ?? 1000;
  const chunkOverlap = params.config?.chunkOverlap ?? 200;

  // Create ingestion record
  const [ingestion] = await db
    .insert(kgiaIngestions)
    .values({
      workspaceId: params.workspaceId,
      sourceId: params.sourceId ?? null,
      name: params.name,
      status: "running",
      documentCount: params.documents.length,
      config: params.config ?? null,
      startedAt: new Date(),
    })
    .returning({ id: kgiaIngestions.id });

  const ingestionId = ingestion.id;
  let totalChunks = 0;
  let totalEntities = 0;
  let totalRelations = 0;

  try {
    for (const doc of params.documents) {
      // 1. Chunk the document
      const chunks = chunkText(doc.content, chunkSize, chunkOverlap);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        // 2. Extract entities and relations (basic NLP)
        const { entities, relations } = extractEntitiesAndRelations(chunk);

        // 3. Resolve entities
        const rawEntities: RawEntity[] = entities.map((e) => ({ text: e }));
        const resolved = await resolveEntities(rawEntities, ingestionId, params.workspaceId);

        // 4. Persist chunk
        await db.insert(kgiaIngestionChunks).values({
          workspaceId: params.workspaceId,
          ingestionId,
          documentName: doc.name,
          chunkIndex: i,
          content: chunk,
          entities: resolved.map((r) => r.resolvedEntity),
          relations: relations as any,
        });

        totalChunks++;
        totalEntities += entities.length;
        totalRelations += relations.length;
      }
    }

    // Update ingestion record
    await db
      .update(kgiaIngestions)
      .set({
        status: "completed",
        chunkCount: totalChunks,
        entityCount: totalEntities,
        relationCount: totalRelations,
        completedAt: new Date(),
      })
      .where(eq(kgiaIngestions.id, ingestionId));
  } catch (err) {
    await db
      .update(kgiaIngestions)
      .set({
        status: "failed",
        chunkCount: totalChunks,
        entityCount: totalEntities,
        relationCount: totalRelations,
        errorMessage: (err as Error).message,
        completedAt: new Date(),
      })
      .where(eq(kgiaIngestions.id, ingestionId));

    throw err;
  }

  return {
    ingestionId,
    status: "completed",
    documentCount: params.documents.length,
    chunkCount: totalChunks,
    entityCount: totalEntities,
    relationCount: totalRelations,
  };
}

/**
 * Get the current status of an ingestion run.
 */
export async function getIngestionStatus(
  ingestionId: number,
  workspaceId: number
): Promise<{
  id: number;
  status: string;
  documentCount: number;
  chunkCount: number;
  entityCount: number;
  relationCount: number;
  errorMessage: string | null;
} | null> {
  const db = getDb();
  if (!db) return null;

  const [row] = await db
    .select()
    .from(kgiaIngestions)
    .where(eq(kgiaIngestions.id, ingestionId))
    .limit(1);

  if (!row || row.workspaceId !== workspaceId) return null;

  return {
    id: row.id,
    status: row.status,
    documentCount: row.documentCount,
    chunkCount: row.chunkCount,
    entityCount: row.entityCount,
    relationCount: row.relationCount,
    errorMessage: row.errorMessage,
  };
}

// ── Internal: Text chunking ────────────────────────────────────────

function chunkText(text: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    start += size - overlap;
    if (start >= text.length) break;
  }

  return chunks;
}

// ── Internal: Basic entity/relation extraction ─────────────────────

interface ExtractResult {
  entities: string[];
  relations: Array<{ subject: string; predicate: string; object: string }>;
}

function extractEntitiesAndRelations(text: string): ExtractResult {
  const entities: Set<string> = new Set();
  const relations: Array<{ subject: string; predicate: string; object: string }> = [];

  // Basic NER: capitalized multi-word phrases (proper nouns)
  const properNounPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  let match;
  while ((match = properNounPattern.exec(text)) !== null) {
    entities.add(match[1]);
  }

  // Single capitalized words (not at sentence start) as potential entities
  const singleCapPattern = /(?<=[.!?]\s+\w+\s+|,\s+)([A-Z][a-z]{2,})\b/g;
  while ((match = singleCapPattern.exec(text)) !== null) {
    entities.add(match[1]);
  }

  // Basic relation extraction: "X is/was/are Y" patterns
  const relPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was|are|were)\s+(?:a|an|the)?\s*([a-z][a-z\s]+?)(?:[.,;]|\s+(?:and|or|but|which|that))/gi;
  while ((match = relPattern.exec(text)) !== null) {
    const subject = match[1].trim();
    const object = match[2].trim();
    if (subject.length > 1 && object.length > 1) {
      entities.add(subject);
      relations.push({ subject, predicate: "is_a", object });
    }
  }

  return {
    entities: Array.from(entities),
    relations,
  };
}
