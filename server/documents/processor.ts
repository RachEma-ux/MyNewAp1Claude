import mammoth from 'mammoth';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Document } from '../../drizzle/schema';

export interface ProcessingResult {
  text: string;
  metadata: {
    pageCount?: number;
    wordCount: number;
    title?: string;
    author?: string;
  };
}

export interface ChunkResult {
  content: string;
  chunkIndex: number;
  metadata?: {
    pageNumber?: number;
    heading?: string;
  };
}

/**
 * Extract text from PDF files
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<ProcessingResult> {
  try {
    // Dynamic import for pdf-parse (CommonJS module)
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = (pdfParseModule as any).default || pdfParseModule;
    const data = await pdfParse(buffer);
    
    return {
      text: data.text,
      metadata: {
        pageCount: data.numpages,
        wordCount: data.text.split(/\s+/).length,
        title: data.info?.Title,
        author: data.info?.Author,
      },
    };
  } catch (error) {
    console.error('[DocumentProcessor] PDF extraction error:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract text from DOCX files
 */
export async function extractTextFromDOCX(buffer: Buffer): Promise<ProcessingResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;
    
    return {
      text,
      metadata: {
        wordCount: text.split(/\s+/).length,
      },
    };
  } catch (error) {
    console.error('[DocumentProcessor] DOCX extraction error:', error);
    throw new Error(`Failed to extract text from DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract text from plain text files
 */
export async function extractTextFromPlainText(buffer: Buffer): Promise<ProcessingResult> {
  try {
    const text = buffer.toString('utf-8');
    
    return {
      text,
      metadata: {
        wordCount: text.split(/\s+/).length,
      },
    };
  } catch (error) {
    console.error('[DocumentProcessor] Text extraction error:', error);
    throw new Error(`Failed to extract text: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract text based on file type
 */
export async function extractText(buffer: Buffer, fileType: string): Promise<ProcessingResult> {
  const normalizedType = fileType.toLowerCase();
  
  if (normalizedType === 'pdf' || normalizedType === 'application/pdf') {
    return extractTextFromPDF(buffer);
  } else if (normalizedType === 'docx' || normalizedType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return extractTextFromDOCX(buffer);
  } else if (normalizedType === 'txt' || normalizedType === 'text/plain' || normalizedType === 'md' || normalizedType === 'text/markdown') {
    return extractTextFromPlainText(buffer);
  } else {
    throw new Error(`Unsupported file type: ${fileType}`);
  }
}

/**
 * Chunk text using fixed-size strategy
 */
export async function chunkTextFixed(
  text: string,
  chunkSize: number = 512,
  chunkOverlap: number = 50
): Promise<ChunkResult[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: ['\n\n', '\n', '. ', ' ', ''],
  });
  
  const chunks = await splitter.createDocuments([text]);
  
  return chunks.map((chunk, index) => ({
    content: chunk.pageContent,
    chunkIndex: index,
  }));
}

/**
 * Chunk text using semantic strategy (sentence-based)
 */
export async function chunkTextSemantic(
  text: string,
  chunkSize: number = 512,
  chunkOverlap: number = 50
): Promise<ChunkResult[]> {
  // Split by sentences first
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  const chunks: ChunkResult[] = [];
  let currentChunk = '';
  let chunkIndex = 0;
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    
    if ((currentChunk + trimmedSentence).length > chunkSize && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        content: currentChunk.trim(),
        chunkIndex: chunkIndex++,
      });
      
      // Start new chunk with overlap
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(chunkOverlap / 5)); // Approximate word count
      currentChunk = overlapWords.join(' ') + ' ' + trimmedSentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
    }
  }
  
  // Add final chunk
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      chunkIndex: chunkIndex,
    });
  }
  
  return chunks;
}

/**
 * Chunk text using recursive strategy (hierarchical)
 */
export async function chunkTextRecursive(
  text: string,
  chunkSize: number = 512,
  chunkOverlap: number = 50
): Promise<ChunkResult[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: ['\n\n\n', '\n\n', '\n', '. ', '! ', '? ', '; ', ': ', ', ', ' ', ''],
  });
  
  const chunks = await splitter.createDocuments([text]);
  
  return chunks.map((chunk, index) => ({
    content: chunk.pageContent,
    chunkIndex: index,
  }));
}

/**
 * Chunk text based on strategy
 */
export async function chunkText(
  text: string,
  strategy: 'semantic' | 'fixed' | 'recursive' = 'semantic',
  chunkSize: number = 512,
  chunkOverlap: number = 50
): Promise<ChunkResult[]> {
  console.log(`[DocumentProcessor] Chunking text with strategy: ${strategy}, size: ${chunkSize}, overlap: ${chunkOverlap}`);
  
  switch (strategy) {
    case 'semantic':
      return chunkTextSemantic(text, chunkSize, chunkOverlap);
    case 'fixed':
      return chunkTextFixed(text, chunkSize, chunkOverlap);
    case 'recursive':
      return chunkTextRecursive(text, chunkSize, chunkOverlap);
    default:
      throw new Error(`Unknown chunking strategy: ${strategy}`);
  }
}

/**
 * Process document upload: store to S3, create DB record, and process in background
 */
export async function processDocumentUpload(
  input: {
    workspaceId: number;
    filename: string;
    fileType: string;
    fileSize: number;
    fileContent: string; // Base64
  },
  userId: number
) {
  const { storagePut } = await import('../storage');
  const {
    createDocument,
    updateDocumentStatus,
    updateDocumentMetadata,
    createDocumentChunks,
  } = await import('./db');

  // Validate file size (16MB limit)
  if (input.fileSize > 16 * 1024 * 1024) {
    throw new Error('File size exceeds 16MB limit');
  }

  // Decode base64 content
  const buffer = Buffer.from(input.fileContent, 'base64');

  // Generate unique file key
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(7);
  const fileKey = `documents/${input.workspaceId}/${timestamp}-${randomSuffix}-${input.filename}`;

  try {
    // Upload to S3
    const { url: fileUrl } = await storagePut(fileKey, buffer, input.fileType);

    // Create document record
    const document = await createDocument({
      workspaceId: input.workspaceId,
      filename: input.filename,
      fileType: input.fileType,
      fileSize: input.fileSize,
      fileUrl,
      fileKey,
      status: 'pending',
      uploadedBy: userId,
    });

    // Process document in background
    processDocumentBackground(
      document.id,
      buffer,
      input.fileType
    ).catch((error) => {
      console.error(`[DocumentProcessor] Background processing failed for document ${document.id}:`, error);
    });

    return {
      success: true,
      documentId: document.id,
      message: 'Document uploaded successfully. Processing in background.',
    };
  } catch (error) {
    console.error('[DocumentProcessor] Upload error:', error);
    throw new Error(`Failed to upload document: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Background document processing
 */
async function processDocumentBackground(
  documentId: number,
  buffer: Buffer,
  fileType: string
) {
  const {
    updateDocumentStatus,
    updateDocumentMetadata,
    createDocumentChunks,
    getDocumentChunks,
  } = await import('./db');

  try {
    console.log(`[DocumentProcessor] Starting background processing for document ${documentId}`);

    // Update status
    await updateDocumentStatus(documentId, 'processing');

    // Process document with default settings
    const { text, metadata, chunks } = await processDocument(
      buffer,
      fileType,
      'semantic',
      512,
      50
    );

    // Update document metadata
    await updateDocumentMetadata(documentId, {
      title: metadata.title,
      author: metadata.author,
      pageCount: metadata.pageCount,
      wordCount: metadata.wordCount,
      chunkCount: chunks.length,
      embeddingModel: 'text-embedding-3-small',
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

    // Generate and store embeddings if OpenAI API key is configured
    if (process.env.OPENAI_API_KEY) {
      try {
        console.log(`[DocumentProcessor] Generating embeddings for document ${documentId}`);
        const { getEmbeddingService } = await import('../embeddings/service');
        const embeddingService = getEmbeddingService();
        
        // Get the saved chunks with their IDs
        const savedChunks = await getDocumentChunks(documentId);
        
        // Store embeddings
        await embeddingService.storeChunkEmbeddings(
          savedChunks.map(chunk => ({
            id: chunk.id,
            content: chunk.content,
            documentId: chunk.documentId,
            chunkIndex: chunk.chunkIndex,
          }))
        );
        
        console.log(`[DocumentProcessor] Embeddings generated for document ${documentId}`);
      } catch (embError) {
        console.error(`[DocumentProcessor] Failed to generate embeddings for document ${documentId}:`, embError);
        // Don't fail the entire process if embeddings fail
      }
    } else {
      console.log(`[DocumentProcessor] Skipping embeddings (OPENAI_API_KEY not configured)`);
    }

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

/**
 * Process a document: extract text and chunk it
 */
export async function processDocument(
  buffer: Buffer,
  fileType: string,
  chunkingStrategy: 'semantic' | 'fixed' | 'recursive' = 'semantic',
  chunkSize: number = 512,
  chunkOverlap: number = 50
): Promise<{
  text: string;
  metadata: ProcessingResult['metadata'];
  chunks: ChunkResult[];
}> {
  console.log(`[DocumentProcessor] Processing document of type: ${fileType}`);
  
  // Extract text
  const { text, metadata } = await extractText(buffer, fileType);
  console.log(`[DocumentProcessor] Extracted ${metadata.wordCount} words`);
  
  // Chunk text
  const chunks = await chunkText(text, chunkingStrategy, chunkSize, chunkOverlap);
  console.log(`[DocumentProcessor] Created ${chunks.length} chunks`);
  
  return {
    text,
    metadata,
    chunks,
  };
}
