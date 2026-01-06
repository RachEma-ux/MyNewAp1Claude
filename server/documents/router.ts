import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import {
  createDocument,
  updateDocumentStatus,
  updateDocumentMetadata,
  createDocumentChunks,
  getDocumentById,
  getDocumentsByWorkspace,
  getDocumentChunks,
  deleteDocument,
} from './db';
import { processDocument } from './processor';
import { storagePut } from '../storage';

/**
 * Document management router
 */
export const documentRouter = router({
  /**
   * Upload and process a document
   */
  upload: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number(),
        filename: z.string(),
        fileType: z.string(),
        fileSize: z.number(),
        fileContent: z.string(), // Base64 encoded
        chunkingStrategy: z.enum(['semantic', 'fixed', 'recursive']).optional(),
        chunkSize: z.number().optional(),
        chunkOverlap: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const {
        workspaceId,
        filename,
        fileType,
        fileSize,
        fileContent,
        chunkingStrategy = 'semantic',
        chunkSize = 512,
        chunkOverlap = 50,
      } = input;

      // Validate file size (16MB limit)
      if (fileSize > 16 * 1024 * 1024) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'File size exceeds 16MB limit',
        });
      }

      // Decode base64 content
      const buffer = Buffer.from(fileContent, 'base64');

      // Generate unique file key
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(7);
      const fileKey = `documents/${workspaceId}/${timestamp}-${randomSuffix}-${filename}`;

      try {
        // Upload to S3
        const { url: fileUrl } = await storagePut(fileKey, buffer, fileType);

        // Create document record
        const document = await createDocument({
          workspaceId,
          filename,
          fileType,
          fileSize,
          fileUrl,
          fileKey,
          status: 'pending',
          uploadedBy: ctx.user.id,
        });

        // Process document in background (don't await)
        processDocumentBackground(
          document.id,
          buffer,
          fileType,
          chunkingStrategy,
          chunkSize,
          chunkOverlap
        ).catch((error) => {
          console.error(`[DocumentRouter] Background processing failed for document ${document.id}:`, error);
        });

        return {
          success: true,
          documentId: document.id,
          message: 'Document uploaded successfully. Processing in background.',
        };
      } catch (error) {
        console.error('[DocumentRouter] Upload error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to upload document: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  /**
   * Get documents by workspace
   */
  getByWorkspace: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => {
      return getDocumentsByWorkspace(input.workspaceId);
    }),

  /**
   * Get document by ID
   */
  getById: protectedProcedure
    .input(z.object({ documentId: z.number() }))
    .query(async ({ input }) => {
      const document = await getDocumentById(input.documentId);
      if (!document) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Document not found',
        });
      }
      return document;
    }),

  /**
   * Get document chunks
   */
  getChunks: protectedProcedure
    .input(z.object({ documentId: z.number() }))
    .query(async ({ input }) => {
      return getDocumentChunks(input.documentId);
    }),

  /**
   * Delete document
   */
  delete: protectedProcedure
    .input(z.object({ documentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const document = await getDocumentById(input.documentId);
      if (!document) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Document not found',
        });
      }

      // Check ownership or admin
      if (document.uploadedBy !== ctx.user.id && ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete this document',
        });
      }

      await deleteDocument(input.documentId);

      return {
        success: true,
        message: 'Document deleted successfully',
      };
    }),

  /**
   * Reprocess document with different settings
   */
  reprocess: protectedProcedure
    .input(
      z.object({
        documentId: z.number(),
        chunkingStrategy: z.enum(['semantic', 'fixed', 'recursive']),
        chunkSize: z.number(),
        chunkOverlap: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const document = await getDocumentById(input.documentId);
      if (!document) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Document not found',
        });
      }

      // Fetch document from S3
      const response = await fetch(document.fileUrl);
      const buffer = Buffer.from(await response.arrayBuffer());

      // Update status to processing
      await updateDocumentStatus(document.id, 'processing');

      // Process in background
      processDocumentBackground(
        document.id,
        buffer,
        document.fileType,
        input.chunkingStrategy,
        input.chunkSize,
        input.chunkOverlap
      ).catch((error) => {
        console.error(`[DocumentRouter] Reprocessing failed for document ${document.id}:`, error);
      });

      return {
        success: true,
        message: 'Document reprocessing started',
      };
    }),
});

/**
 * Background document processing
 */
async function processDocumentBackground(
  documentId: number,
  buffer: Buffer,
  fileType: string,
  chunkingStrategy: 'semantic' | 'fixed' | 'recursive',
  chunkSize: number,
  chunkOverlap: number
) {
  try {
    console.log(`[DocumentProcessor] Starting background processing for document ${documentId}`);

    // Update status
    await updateDocumentStatus(documentId, 'processing');

    // Process document
    const { text, metadata, chunks } = await processDocument(
      buffer,
      fileType,
      chunkingStrategy,
      chunkSize,
      chunkOverlap
    );

    // Update document metadata
    await updateDocumentMetadata(documentId, {
      title: metadata.title,
      author: metadata.author,
      pageCount: metadata.pageCount,
      wordCount: metadata.wordCount,
      chunkCount: chunks.length,
    });

    // Save chunks to database
    const chunkRecords = chunks.map((chunk) => ({
      documentId,
      content: chunk.content,
      chunkIndex: chunk.chunkIndex,
      pageNumber: chunk.metadata?.pageNumber,
      heading: chunk.metadata?.heading,
    }));

    await createDocumentChunks(chunkRecords);

    // Update status to completed
    await updateDocumentStatus(documentId, 'completed');

    console.log(`[DocumentProcessor] Completed processing for document ${documentId}: ${chunks.length} chunks created`);
  } catch (error) {
    console.error(`[DocumentProcessor] Error processing document ${documentId}:`, error);
    await updateDocumentStatus(
      documentId,
      'error',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}
