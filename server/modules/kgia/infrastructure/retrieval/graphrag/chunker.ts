/**
 * GraphRAG — Document Chunker
 *
 * Splits documents into overlapping chunks for entity extraction.
 * Preserves sentence boundaries where possible.
 */

export interface Chunk {
  index: number;
  content: string;
  startOffset: number;
  endOffset: number;
}

/**
 * Split text into overlapping chunks.
 * Prefers breaking at sentence boundaries.
 */
export function chunkDocument(
  text: string,
  chunkSize: number = 1000,
  chunkOverlap: number = 200
): Chunk[] {
  if (text.length <= chunkSize) {
    return [{ index: 0, content: text, startOffset: 0, endOffset: text.length }];
  }

  const chunks: Chunk[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    // Try to break at sentence boundary
    if (end < text.length) {
      const sentenceEnd = findSentenceBreak(text, start + chunkSize - 100, end);
      if (sentenceEnd > start) end = sentenceEnd;
    }

    chunks.push({
      index: chunks.length,
      content: text.slice(start, end),
      startOffset: start,
      endOffset: end,
    });

    start = end - chunkOverlap;
    if (start >= text.length) break;
  }

  return chunks;
}

function findSentenceBreak(text: string, searchStart: number, searchEnd: number): number {
  const region = text.slice(searchStart, searchEnd);
  const lastPeriod = region.lastIndexOf(". ");
  const lastNewline = region.lastIndexOf("\n");
  const lastBreak = Math.max(lastPeriod, lastNewline);

  if (lastBreak > 0) return searchStart + lastBreak + 1;
  return searchEnd;
}
