import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { chunkDocument } from "./chunking-service";
import { ingestFromBuffer } from "./rag-pipeline";

/**
 * Documents Router
 * Handles document ingestion and RAG retrieval
 */
export const documentsRouter = router({
  /**
   * Upload and process a document file
   */
  uploadFile: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        fileContent: z.string(), // Base64 encoded file content
        workspaceId: z.number(),
        collectionName: z.string(),
        chunkingStrategy: z.enum(["fixed", "semantic", "recursive"]).optional(),
        chunkSize: z.number().optional(),
        chunkOverlap: z.number().optional(),
        embeddingModel: z.enum(["bge-large-en", "bge-base-en", "minilm-l6", "e5-large", "e5-base"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Decode base64 file content to buffer
        const buffer = Buffer.from(input.fileContent, "base64");

        // Ingest the document through RAG pipeline
        const result = await ingestFromBuffer(buffer, input.filename, {
          workspaceId: input.workspaceId,
          collectionName: input.collectionName,
          chunkingOptions: {
            strategy: input.chunkingStrategy || "fixed",
            chunkSize: input.chunkSize || 1000,
            chunkOverlap: input.chunkOverlap || 200,
          },
          embeddingModel: input.embeddingModel || "bge-base-en",
        });

        return {
          success: true,
          documentId: result.documentId,
          chunksCreated: result.chunksCreated,
          vectorsStored: result.vectorsStored,
          metadata: result.metadata,
        };
      } catch (error: any) {
        console.error("[Documents] Upload failed:", error);
        throw new Error(`Failed to process document: ${error.message}`);
      }
    }),

  /**
   * Ingest a document into the RAG system
   */
  ingest: protectedProcedure
    .input(
      z.object({
        content: z.string(),
        filename: z.string(),
        fileType: z.enum(["pdf", "docx", "txt", "csv", "markdown"]),
        collectionName: z.string(),
        chunkingStrategy: z.enum(["fixed", "semantic", "recursive"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Extract text from content (assuming content is already extracted or is plain text)
      const text = input.content;

      // Chunk the text
      const chunks = chunkDocument(text, {
        strategy: input.chunkingStrategy || "fixed",
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      // For now, return success (actual ingestion requires file path)
      return {
        success: true,
        chunksCreated: chunks.length,
        message: "Document chunked successfully. Use ingestFromBuffer for actual storage.",
      };
    }),

  /**
   * Retrieve relevant chunks for a query (RAG retrieval)
   */
  retrieve: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        collectionName: z.string(),
        limit: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      // Retrieve requires workspaceId and limit parameters
      // For now, return mock data
      return [
        {
          text: "Sample chunk 1 matching query: " + input.query,
          score: 0.95,
          metadata: { source: input.collectionName },
        },
        {
          text: "Sample chunk 2 matching query: " + input.query,
          score: 0.87,
          metadata: { source: input.collectionName },
        },
      ];
    }),

  /**
   * List available collections
   */
  listCollections: protectedProcedure.query(async () => {
    // This would query Qdrant for available collections
    // For now, return mock data
    return [
      { name: "documents", vectorCount: 0, createdAt: new Date().toISOString() },
      { name: "knowledge-base", vectorCount: 0, createdAt: new Date().toISOString() },
    ];
  }),
});
