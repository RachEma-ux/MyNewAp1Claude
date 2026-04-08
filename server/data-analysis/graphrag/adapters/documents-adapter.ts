/**
 * Documents Module — GraphRAG Source Adapter (Pilot)
 *
 * Exports processed documents from the Documents module as
 * normalized GraphRAG-ready documents. This is the first real
 * pilot integration for GraphRAG.
 *
 * Boundary rules:
 * - This adapter is hard-bound to moduleSlug: "documents"
 * - It only reads from the documents + document_chunks tables
 * - It does not expose internal schema details in metadata
 */

import type { GraphRagSourceAdapter, GraphRagDocument } from "../types";
import { getDb } from "../../../db/connection";
import { documents, documentChunks } from "../../../../drizzle/schema";
import { and, eq, gt, asc } from "drizzle-orm";

export const documentsGraphRagAdapter: GraphRagSourceAdapter = {
  moduleSlug: "documents",
  datasetKey: "all-documents",
  displayName: "Documents Library",
  description:
    "All processed documents in the document management system, suitable for knowledge graph extraction.",

  async exportDocuments(args) {
    const db = getDb();
    if (!db) return [];

    const limit = args.limit ?? 1000;

    // Build query conditions
    let query = db
      .select({
        id: documents.id,
        title: documents.title,
        filename: documents.filename,
        fileType: documents.fileType,
        status: documents.status,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(eq(documents.status, "completed"))
      .orderBy(asc(documents.id))
      .limit(limit);

    // If we have a cursor, only fetch newer records
    if (args.sinceCursor) {
      const cursorId = parseInt(args.sinceCursor, 10);
      if (!isNaN(cursorId)) {
        query = db
          .select({
            id: documents.id,
            title: documents.title,
            filename: documents.filename,
            fileType: documents.fileType,
            status: documents.status,
            createdAt: documents.createdAt,
          })
          .from(documents)
          // Drizzle's PgSelect doesn't allow chaining two .where() calls;
          // combine them with and() instead.
          .where(
            and(eq(documents.status, "completed"), gt(documents.id, cursorId))
          )
          .orderBy(asc(documents.id))
          .limit(limit);
      }
    }

    const rows = await query;

    // For each document, gather chunk text to compose full text
    const results: GraphRagDocument[] = [];

    for (const doc of rows) {
      const chunks = await db
        .select({ content: documentChunks.content })
        .from(documentChunks)
        .where(eq(documentChunks.documentId, doc.id))
        .orderBy(asc(documentChunks.chunkIndex));

      const fullText = chunks.map((c) => c.content).join("\n\n");

      results.push({
        id: String(doc.id),
        text: fullText || `[Document: ${doc.filename}]`,
        title: doc.title || doc.filename,
        creation_date: doc.createdAt?.toISOString() ?? new Date().toISOString(),
        metadata: {
          source: "documents",
          fileType: doc.fileType,
          filename: doc.filename,
        },
      });
    }

    return results;
  },
};
