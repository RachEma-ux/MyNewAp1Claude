/**
 * Port: Document Store — abstract interface for document access.
 * Used by GraphRAG ingestion pipeline to load source documents.
 */
export interface DocumentChunk {
  id: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentStorePort {
  /** Load document content by ID */
  getDocument(documentId: string): Promise<{ name: string; content: string } | null>;

  /** List documents in a workspace */
  listDocuments(workspaceId: number): Promise<Array<{ id: string; name: string; size: number }>>;

  /** Store processed chunks */
  storeChunks(chunks: DocumentChunk[]): Promise<void>;
}
