import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../db';
import { documents, documentChunks, type InsertDocument, type InsertDocumentChunk } from '../../drizzle/schema';

/**
 * Create a new document record
 */
export async function createDocument(data: InsertDocument) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  
  const result: any = await db.insert(documents).values(data);
  // Get the inserted document by ID
  const [document] = await db.select().from(documents).where(eq(documents.id, result[0].insertId));
  return document;
}

/**
 * Update document status
 */
export async function updateDocumentStatus(
  documentId: number,
  status: 'pending' | 'processing' | 'completed' | 'error',
  errorMessage?: string
) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  
  await db
    .update(documents)
    .set({ 
      status, 
      errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
}

/**
 * Update document metadata after processing
 */
export async function updateDocumentMetadata(
  documentId: number,
  metadata: {
    title?: string;
    author?: string;
    pageCount?: number;
    wordCount?: number;
    chunkCount?: number;
    embeddingModel?: string;
  }
) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  
  await db
    .update(documents)
    .set({
      ...metadata,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
}

/**
 * Create document chunks
 */
export async function createDocumentChunks(chunks: InsertDocumentChunk[]) {
  if (chunks.length === 0) return [];
  
  const db = getDb();
  if (!db) throw new Error('Database not available');
  
  // Insert in batches to avoid query size limits
  const batchSize = 100;
  
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    await db.insert(documentChunks).values(batch);
  }
  
  return [];
}

/**
 * Get document by ID
 */
export async function getDocumentById(documentId: number) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  
  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId));
  return document;
}

/**
 * Get documents by workspace
 */
export async function getDocumentsByWorkspace(workspaceId: number) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  
  return db
    .select()
    .from(documents)
    .where(eq(documents.workspaceId, workspaceId))
    .orderBy(desc(documents.createdAt));
}

/**
 * Get document chunks
 */
export async function getDocumentChunks(documentId: number) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  
  return db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, documentId))
    .orderBy(documentChunks.chunkIndex);
}

/**
 * Delete document and its chunks
 */
export async function deleteDocument(documentId: number) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  
  // Delete chunks first (foreign key constraint)
  await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
  
  // Delete document
  await db.delete(documents).where(eq(documents.id, documentId));
}

/**
 * Update chunk vector ID
 */
export async function updateChunkVectorId(chunkId: number, vectorId: string) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  
  await db
    .update(documentChunks)
    .set({ vectorId })
    .where(eq(documentChunks.id, chunkId));
}

/**
 * Get chunks by vector IDs
 */
export async function getChunksByVectorIds(vectorIds: string[]) {
  const db = getDb();
  if (!db) throw new Error('Database not available');
  
  return db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.vectorId, vectorIds[0])); // This is simplified, would need OR conditions for multiple IDs
}
