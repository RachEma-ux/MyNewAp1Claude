/**
 * Reranking Service
 * Reranks search results using cross-encoder models for better relevance
 */

import { VectorSearchResult } from "./qdrant-service";

export interface RerankRequest {
  query: string;
  documents: Array<{
    id: string | number;
    text: string;
    score?: number;
  }>;
  topK?: number;
  model?: "cross-encoder" | "bge-reranker" | "cohere";
}

export interface RerankResult {
  id: string | number;
  text: string;
  originalScore: number;
  rerankScore: number;
  finalScore: number;
}

/**
 * Reranking Service
 * 
 * Reranking improves search quality by using cross-encoder models that
 * directly score query-document pairs, unlike bi-encoders used for initial retrieval.
 */
export class RerankingService {
  /**
   * Rerank search results
   */
  async rerank(request: RerankRequest): Promise<RerankResult[]> {
    const { query, documents, topK = 10, model = "cross-encoder" } = request;

    // Calculate rerank scores based on model
    const scored = await Promise.all(
      documents.map(async (doc) => {
        const rerankScore = await this.calculateRerankScore(query, doc.text, model);
        const originalScore = doc.score || 0;
        
        // Combine original and rerank scores (weighted average)
        const finalScore = originalScore * 0.3 + rerankScore * 0.7;

        return {
          id: doc.id,
          text: doc.text,
          originalScore,
          rerankScore,
          finalScore,
        };
      })
    );

    // Sort by final score (descending)
    scored.sort((a, b) => b.finalScore - a.finalScore);

    // Return top K
    return scored.slice(0, topK);
  }

  /**
   * Calculate rerank score for a query-document pair
   */
  private async calculateRerankScore(
    query: string,
    document: string,
    model: string
  ): Promise<number> {
    switch (model) {
      case "cross-encoder":
        return this.crossEncoderScore(query, document);
      case "bge-reranker":
        return this.bgeRerankerScore(query, document);
      case "cohere":
        return this.cohereRerankerScore(query, document);
      default:
        return this.crossEncoderScore(query, document);
    }
  }

  /**
   * Cross-encoder scoring (lightweight heuristic implementation)
   * In production, this would call a real cross-encoder model API
   */
  private crossEncoderScore(query: string, document: string): number {
    // Normalize texts
    const queryLower = query.toLowerCase();
    const docLower = document.toLowerCase();

    // Split into words
    const queryWords = queryLower.split(/\s+/);
    const docWords = new Set(docLower.split(/\s+/));

    // Calculate word overlap
    let matchCount = 0;
    for (const word of queryWords) {
      if (docWords.has(word)) {
        matchCount++;
      }
    }

    const wordOverlap = queryWords.length > 0 ? matchCount / queryWords.length : 0;

    // Calculate position bonus (earlier matches are better)
    let positionScore = 0;
    const docLength = document.length;
    for (const word of queryWords) {
      const index = docLower.indexOf(word);
      if (index !== -1) {
        // Earlier positions get higher scores
        positionScore += 1 - index / docLength;
      }
    }
    positionScore = positionScore / queryWords.length;

    // Calculate phrase match bonus
    const phraseMatch = docLower.includes(queryLower) ? 0.3 : 0;

    // Combine scores
    const finalScore = wordOverlap * 0.5 + positionScore * 0.3 + phraseMatch * 0.2;

    return Math.min(1, finalScore); // Normalize to [0, 1]
  }

  /**
   * BGE Reranker scoring
   * BGE (BAAI General Embedding) reranker is optimized for Chinese and English
   */
  private bgeRerankerScore(query: string, document: string): number {
    // Similar to cross-encoder but with different weights
    const baseScore = this.crossEncoderScore(query, document);
    
    // BGE tends to favor longer, more detailed documents
    const lengthBonus = Math.min(0.2, document.length / 5000);
    
    return Math.min(1, baseScore + lengthBonus);
  }

  /**
   * Cohere Reranker scoring
   * Cohere's reranker API (would require API key in production)
   */
  private async cohereRerankerScore(query: string, document: string): Promise<number> {
    // In production, this would call Cohere's rerank API
    // For now, use enhanced cross-encoder scoring
    const baseScore = this.crossEncoderScore(query, document);
    
    // Cohere emphasizes semantic similarity over exact matches
    const semanticBonus = this.calculateSemanticSimilarity(query, document);
    
    return Math.min(1, baseScore * 0.6 + semanticBonus * 0.4);
  }

  /**
   * Calculate semantic similarity (simple heuristic)
   */
  private calculateSemanticSimilarity(query: string, document: string): number {
    // Extract key concepts (nouns, verbs)
    const queryConcepts = this.extractConcepts(query);
    const docConcepts = this.extractConcepts(document);

    const queryConceptsArray = Array.from(queryConcepts);
    if (queryConceptsArray.length === 0) return 0;

    // Calculate concept overlap
    let matchCount = 0;
    for (const concept of queryConceptsArray) {
      if (docConcepts.has(concept)) {
        matchCount++;
      }
    }

    return matchCount / queryConceptsArray.length;
  }

  /**
   * Extract key concepts from text (simple implementation)
   */
  private extractConcepts(text: string): Set<string> {
    const words = text.toLowerCase().split(/\s+/);
    
    // Filter out common stop words
    const stopWords = new Set([
      "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
      "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
      "been", "being", "have", "has", "had", "do", "does", "did", "will",
      "would", "should", "could", "may", "might", "must", "can", "this",
      "that", "these", "those", "i", "you", "he", "she", "it", "we", "they",
    ]);

    const concepts = new Set<string>();
    for (const word of words) {
      if (word.length > 3 && !stopWords.has(word)) {
        concepts.add(word);
      }
    }

    return concepts;
  }

  /**
   * Rerank vector search results
   */
  async rerankVectorResults(
    query: string,
    results: VectorSearchResult[],
    topK?: number
  ): Promise<RerankResult[]> {
    const documents = results.map((result) => ({
      id: result.id,
      text: result.payload.text || result.payload.content || "",
      score: result.score,
    }));

    return this.rerank({
      query,
      documents,
      topK,
    });
  }

  /**
   * Reciprocal Rank Fusion (RRF)
   * Combines multiple ranked lists into a single ranking
   */
  reciprocalRankFusion(
    rankedLists: Array<Array<{ id: string | number; score: number }>>,
    k = 60
  ): Array<{ id: string | number; score: number }> {
    const scores = new Map<string | number, number>();

    // Calculate RRF scores
    for (const rankedList of rankedLists) {
      rankedList.forEach((item, rank) => {
        const rrfScore = 1 / (k + rank + 1);
        const currentScore = scores.get(item.id) || 0;
        scores.set(item.id, currentScore + rrfScore);
      });
    }

    // Convert to array and sort
    const results = Array.from(scores.entries()).map(([id, score]) => ({
      id,
      score,
    }));

    results.sort((a, b) => b.score - a.score);

    return results;
  }
}

// Singleton instance
export const rerankingService = new RerankingService();
