/**
 * RAG (Retrieval-Augmented Generation) Pipeline
 * Orchestrates document ingestion: extract → chunk → embed → store
 */

import { extractDocument, extractFromBuffer } from "./extraction-service";
import { chunkDocument, type ChunkingOptions } from "./chunking-service";
import { embeddingEngine } from "../embeddings/embedding-engine";
import { qdrantService } from "../vectordb/qdrant-service";

export interface IngestionOptions {
  workspaceId: number;
  collectionName: string;
  chunkingOptions: ChunkingOptions;
  embeddingModel?: "bge-large-en" | "bge-base-en" | "minilm-l6" | "e5-large" | "e5-base";
}

export interface IngestionResult {
  documentId: string;
  chunksCreated: number;
  vectorsStored: number;
  metadata: {
    format: string;
    wordCount: number;
    charCount: number;
  };
}

/**
 * Ingest a document from file path
 */
export async function ingestDocument(
  filePath: string,
  options: IngestionOptions
): Promise<IngestionResult> {
  console.log(`[RAG] Starting ingestion for ${filePath}`);
  
  // Step 1: Extract text from document
  const extraction = await extractDocument(filePath);
  console.log(`[RAG] Extracted ${extraction.text.length} characters`);
  
  // Step 2: Chunk the document
  const chunks = chunkDocument(extraction.text, options.chunkingOptions);
  console.log(`[RAG] Created ${chunks.length} chunks`);
  
  // Step 3: Generate embeddings for chunks
  const chunkTexts = chunks.map((c) => c.text);
  const embeddings = await embeddingEngine.generate({
    texts: chunkTexts,
    model: options.embeddingModel as any,
  });
  console.log(`[RAG] Generated ${embeddings.embeddings.length} embeddings`);
  
  // Step 4: Store vectors in Qdrant
  const documentId = `doc-${Date.now()}`;
  const payloads = chunks.map((chunk, i) => ({
    documentId,
    workspaceId: options.workspaceId,
    text: chunk.text,
    chunkIndex: chunk.index,
    metadata: chunk.metadata,
  }));
  
  await qdrantService.insert({
    collection: options.collectionName,
    vectors: embeddings.embeddings,
    payloads,
  });
  
  console.log(`[RAG] Stored ${embeddings.embeddings.length} vectors in ${options.collectionName}`);
  
  return {
    documentId,
    chunksCreated: chunks.length,
    vectorsStored: embeddings.embeddings.length,
    metadata: extraction.metadata,
  };
}

/**
 * Ingest a document from buffer (uploaded file)
 */
export async function ingestFromBuffer(
  buffer: Buffer,
  filename: string,
  options: IngestionOptions
): Promise<IngestionResult> {
  console.log(`[RAG] Starting ingestion for uploaded file: ${filename}`);
  
  // Step 1: Extract text from buffer
  const extraction = await extractFromBuffer(buffer, filename);
  console.log(`[RAG] Extracted ${extraction.text.length} characters`);
  
  // Step 2: Chunk the document
  const chunks = chunkDocument(extraction.text, options.chunkingOptions);
  console.log(`[RAG] Created ${chunks.length} chunks`);
  
  // Step 3: Generate embeddings for chunks
  const chunkTexts = chunks.map((c) => c.text);
  const embeddings = await embeddingEngine.generate({
    texts: chunkTexts,
    model: options.embeddingModel as any,
  });
  console.log(`[RAG] Generated ${embeddings.embeddings.length} embeddings`);
  
  // Step 4: Store vectors in Qdrant
  const documentId = `doc-${Date.now()}`;
  const payloads = chunks.map((chunk, i) => ({
    documentId,
    workspaceId: options.workspaceId,
    text: chunk.text,
    chunkIndex: chunk.index,
    metadata: chunk.metadata,
    filename,
  }));
  
  await qdrantService.insert({
    collection: options.collectionName,
    vectors: embeddings.embeddings,
    payloads,
  });
  
  console.log(`[RAG] Stored ${embeddings.embeddings.length} vectors in ${options.collectionName}`);
  
  return {
    documentId,
    chunksCreated: chunks.length,
    vectorsStored: embeddings.embeddings.length,
    metadata: extraction.metadata,
  };
}

/**
 * Retrieve relevant chunks for a query
 */
export async function retrieveRelevantChunks(
  query: string,
  collectionName: string,
  workspaceId: number,
  limit = 5
): Promise<Array<{ text: string; score: number; metadata: any }>> {
  console.log(`[RAG] Retrieving relevant chunks for query: ${query}`);
  
  // Step 1: Generate embedding for query
  const queryEmbedding = await embeddingEngine.generate({
    texts: [query],
  });
  
  // Step 2: Search in vector database
  const results = await qdrantService.search({
    collection: collectionName,
    query: queryEmbedding.embeddings[0],
    limit,
    filter: {
      must: [
        {
          key: "workspaceId",
          match: {
            value: workspaceId,
          },
        },
      ],
    },
  });
  
  console.log(`[RAG] Found ${results.length} relevant chunks`);
  
  return results.map((r) => ({
    text: r.payload.text,
    score: r.score,
    metadata: r.payload.metadata,
  }));
}
