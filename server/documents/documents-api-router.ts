import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

export const documentsApiRouter = router({
  // List all documents with details
  listDocuments: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const { getDocumentsWithDetails } = await import("../db");
      const documents = await getDocumentsWithDetails(input.workspaceId);
      
      // Get workspace name
      const { getWorkspaceById } = await import("../db");
      const workspace = await getWorkspaceById(input.workspaceId);
      const workspaceName = workspace?.name || "Unknown Workspace";

      // Transform to match UI expectations
      return documents.map((doc) => ({
        id: doc.id,
        filename: doc.filename,
        status: doc.status,
        collection: "documents", // Default collection name
        workspaceId: doc.workspaceId,
        workspaceName,
        chunksCreated: doc.chunkCount || 0,
        vectorsStored: doc.vectorsStored || 0,
        fileSize: formatFileSize(doc.fileSize),
        uploadedAt: doc.createdAt,
        processedAt: doc.status === "completed" ? doc.updatedAt : null,
        wordCount: doc.wordCount || 0,
        charCount: doc.wordCount ? doc.wordCount * 5 : 0, // Estimate
        error: doc.errorMessage,
      }));
    }),

  // Get document chunks for preview
  getDocumentChunks: protectedProcedure
    .input(z.object({
      documentId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const { getDocumentChunks } = await import("../db");
      return await getDocumentChunks(input.documentId);
    }),

  // Delete a document
  deleteDocument: protectedProcedure
    .input(z.object({
      documentId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { deleteDocumentWithChunks } = await import("../db");
      await deleteDocumentWithChunks(input.documentId);
      return { success: true };
    }),

  // Bulk delete documents
  bulkDeleteDocuments: protectedProcedure
    .input(z.object({
      documentIds: z.array(z.number()),
    }))
    .mutation(async ({ input, ctx }) => {
      const { bulkDeleteDocuments } = await import("../db");
      await bulkDeleteDocuments(input.documentIds);
      return { success: true };
    }),
});

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
