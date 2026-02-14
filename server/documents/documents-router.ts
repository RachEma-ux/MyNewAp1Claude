import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { chunkDocument } from "./chunking-service";
import { ingestFromBuffer, retrieveRelevantChunks } from "./rag-pipeline";
import { qdrantService } from "../vectordb/qdrant-service";

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
        workspaceId: z.number().optional(),
        limit: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const results = await retrieveRelevantChunks(
          input.query,
          input.collectionName,
          input.workspaceId ?? 1,
          input.limit ?? 5,
        );
        return results;
      } catch (error: any) {
        console.error("[Documents] Retrieve failed:", error);
        return [];
      }
    }),

  /**
   * List available collections
   */
  listCollections: protectedProcedure.query(async () => {
    try {
      const names = await qdrantService.listCollections();
      const collections = await Promise.all(
        names.map(async (name) => {
          const vectorCount = await qdrantService.count(name).catch(() => 0);
          return { name, vectorCount, createdAt: new Date().toISOString() };
        })
      );
      return collections;
    } catch (error: any) {
      console.error("[Documents] List collections failed:", error);
      return [];
    }
  }),
});
