/**
 * Document Chunking Service
 * Splits documents into chunks for embedding and retrieval
 */

export interface ChunkingOptions {
  strategy: "fixed" | "semantic" | "recursive";
  chunkSize: number;
  chunkOverlap: number;
}

export interface DocumentChunk {
  text: string;
  index: number;
  metadata: {
    startChar: number;
    endChar: number;
    wordCount: number;
  };
}

/**
 * Fixed-size chunking
 * Splits text into chunks of fixed character length with overlap
 */
function chunkFixed(text: string, chunkSize: number, overlap: number): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let index = 0;
  let startChar = 0;
  
  while (startChar < text.length) {
    const endChar = Math.min(startChar + chunkSize, text.length);
    const chunkText = text.substring(startChar, endChar);
    
    chunks.push({
      text: chunkText,
      index,
      metadata: {
        startChar,
        endChar,
        wordCount: chunkText.split(/\s+/).length,
      },
    });
    
    index++;
    startChar += chunkSize - overlap;
  }
  
  return chunks;
}

/**
 * Semantic chunking
 * Splits text at natural boundaries (paragraphs, sentences)
 */
function chunkSemantic(text: string, chunkSize: number, overlap: number): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  
  // Split by paragraphs first
  const paragraphs = text.split(/\n\n+/);
  
  let currentChunk = "";
  let index = 0;
  let startChar = 0;
  
  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed chunk size, save current chunk
    if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        index,
        metadata: {
          startChar,
          endChar: startChar + currentChunk.length,
          wordCount: currentChunk.split(/\s+/).length,
        },
      });
      
      index++;
      
      // Apply overlap by keeping last N characters
      const overlapText = currentChunk.slice(-overlap);
      startChar += currentChunk.length - overlap;
      currentChunk = overlapText + " " + paragraph;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    }
  }
  
  // Add remaining chunk
  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      index,
      metadata: {
        startChar,
        endChar: startChar + currentChunk.length,
        wordCount: currentChunk.split(/\s+/).length,
      },
    });
  }
  
  return chunks;
}

/**
 * Recursive chunking
 * Splits text hierarchically (paragraphs → sentences → words)
 */
function chunkRecursive(text: string, chunkSize: number, overlap: number): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  
  // Split by paragraphs
  const paragraphs = text.split(/\n\n+/);
  
  let index = 0;
  let startChar = 0;
  
  for (const paragraph of paragraphs) {
    if (paragraph.length <= chunkSize) {
      // Paragraph fits in one chunk
      chunks.push({
        text: paragraph.trim(),
        index,
        metadata: {
          startChar,
          endChar: startChar + paragraph.length,
          wordCount: paragraph.split(/\s+/).length,
        },
      });
      
      index++;
      startChar += paragraph.length;
    } else {
      // Split paragraph into sentences
      const sentences = paragraph.split(/[.!?]+\s+/);
      let currentChunk = "";
      
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
          chunks.push({
            text: currentChunk.trim(),
            index,
            metadata: {
              startChar,
              endChar: startChar + currentChunk.length,
              wordCount: currentChunk.split(/\s+/).length,
            },
          });
          
          index++;
          
          // Apply overlap
          const overlapText = currentChunk.slice(-overlap);
          startChar += currentChunk.length - overlap;
          currentChunk = overlapText + " " + sentence;
        } else {
          currentChunk += (currentChunk ? " " : "") + sentence;
        }
      }
      
      // Add remaining chunk
      if (currentChunk.trim()) {
        chunks.push({
          text: currentChunk.trim(),
          index,
          metadata: {
            startChar,
            endChar: startChar + currentChunk.length,
            wordCount: currentChunk.split(/\s+/).length,
          },
        });
        
        index++;
        startChar += currentChunk.length;
      }
    }
  }
  
  return chunks;
}

/**
 * Chunk a document using the specified strategy
 */
export function chunkDocument(text: string, options: ChunkingOptions): DocumentChunk[] {
  switch (options.strategy) {
    case "fixed":
      return chunkFixed(text, options.chunkSize, options.chunkOverlap);
    
    case "semantic":
      return chunkSemantic(text, options.chunkSize, options.chunkOverlap);
    
    case "recursive":
      return chunkRecursive(text, options.chunkSize, options.chunkOverlap);
    
    default:
      throw new Error(`Unknown chunking strategy: ${options.strategy}`);
  }
}
