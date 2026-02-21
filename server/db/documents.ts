import { eq, desc, sql } from "drizzle-orm";
import {
  documents,
  InsertDocument,
  Document,
  documentChunks,
  DocumentChunk,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function createDocument(document: InsertDocument): Promise<Document> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [created] = await db.insert(documents).values(document).returning();
  return created;
}

export async function getWorkspaceDocuments(workspaceId: number): Promise<Document[]> {
  const db = getDb();
  if (!db) return [];

  return await db.select().from(documents).where(eq(documents.workspaceId, workspaceId)).orderBy(desc(documents.createdAt));
}

export async function getDocumentById(documentId: number): Promise<Document | undefined> {
  const db = getDb();
  if (!db) return undefined;

  const result = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  return result[0];
}

export async function updateDocument(documentId: number, updates: Partial<Document>): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.update(documents).set(updates).where(eq(documents.id, documentId));
}

export async function deleteDocument(documentId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(documents).where(eq(documents.id, documentId));
}

export async function getDocumentsWithDetails(workspaceId: number) {
  const db = getDb();
  if (!db) return [];

  const query = db
    .select({
      id: documents.id,
      filename: documents.filename,
      fileType: documents.fileType,
      fileSize: documents.fileSize,
      fileUrl: documents.fileUrl,
      fileKey: documents.fileKey,
      status: documents.status,
      errorMessage: documents.errorMessage,
      title: documents.title,
      author: documents.author,
      pageCount: documents.pageCount,
      wordCount: documents.wordCount,
      chunkCount: documents.chunkCount,
      embeddingModel: documents.embeddingModel,
      workspaceId: documents.workspaceId,
      uploadedBy: documents.uploadedBy,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      vectorsStored: sql<number>`(SELECT COUNT(*) FROM ${documentChunks} WHERE ${documentChunks.documentId} = ${documents.id} AND ${documentChunks.vectorId} IS NOT NULL)`,
    })
    .from(documents)
    .where(eq(documents.workspaceId, workspaceId))
    .orderBy(desc(documents.createdAt));

  return await query;
}

export async function getDocumentChunks(documentId: number): Promise<DocumentChunk[]> {
  const db = getDb();
  if (!db) return [];

  return await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, documentId))
    .orderBy(documentChunks.chunkIndex);
}

export async function deleteDocumentWithChunks(documentId: number): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
  await db.delete(documents).where(eq(documents.id, documentId));
}

export async function bulkDeleteDocuments(documentIds: number[]): Promise<void> {
  const db = getDb();
  if (!db || documentIds.length === 0) return;

  await db.delete(documentChunks).where(sql`${documentChunks.documentId} IN (${sql.join(documentIds.map(id => sql`${id}`), sql`, `)})`);
  await db.delete(documents).where(sql`${documents.id} IN (${sql.join(documentIds.map(id => sql`${id}`), sql`, `)})`);
}
