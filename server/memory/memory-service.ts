/**
 * Memory System Service
 * Manages short-term (conversation context) and long-term (persistent knowledge) memory
 */

import { embeddingEngine } from "../embeddings/embedding-engine";
import { qdrantService } from "../vectordb/qdrant-service";

export interface MemoryEntry {
  id: string;
  type: "short" | "long";
  content: string;
  metadata: {
    timestamp: number;
    workspaceId: number;
    userId?: number;
    conversationId?: string;
    importance?: number; // 0-1 score
    accessCount?: number;
    lastAccessed?: number;
  };
}

export interface MemorySummary {
  id: string;
  originalEntries: string[];
  summary: string;
  timestamp: number;
}

/**
 * Memory System
 */
class MemorySystem {
  private shortTermMemory: Map<string, MemoryEntry[]> = new Map();
  private readonly SHORT_TERM_LIMIT = 50; // Max entries per conversation
  private readonly SHORT_TERM_TTL = 3600000; // 1 hour in ms
  
  /**
   * Add entry to short-term memory (conversation context)
   */
  async addShortTermMemory(
    conversationId: string,
    content: string,
    metadata: Partial<MemoryEntry["metadata"]>
  ): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      id: `stm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: "short",
      content,
      metadata: {
        timestamp: Date.now(),
        workspaceId: metadata.workspaceId!,
        userId: metadata.userId,
        conversationId,
        importance: 0.5,
        accessCount: 0,
      },
    };
    
    // Get or create conversation memory
    const conversationMemory = this.shortTermMemory.get(conversationId) || [];
    conversationMemory.push(entry);
    
    // Trim if exceeds limit
    if (conversationMemory.length > this.SHORT_TERM_LIMIT) {
      conversationMemory.shift();
    }
    
    this.shortTermMemory.set(conversationId, conversationMemory);
    
    return entry;
  }
  
  /**
   * Get short-term memory for a conversation
   */
  getShortTermMemory(conversationId: string, limit?: number): MemoryEntry[] {
    const memory = this.shortTermMemory.get(conversationId) || [];
    
    // Filter out expired entries
    const now = Date.now();
    const validMemory = memory.filter(
      (entry) => now - entry.metadata.timestamp < this.SHORT_TERM_TTL
    );
    
    // Update if filtered
    if (validMemory.length !== memory.length) {
      this.shortTermMemory.set(conversationId, validMemory);
    }
    
    // Return most recent entries
    return limit ? validMemory.slice(-limit) : validMemory;
  }
  
  /**
   * Add entry to long-term memory (persistent knowledge)
   */
  async addLongTermMemory(
    content: string,
    metadata: Partial<MemoryEntry["metadata"]>
  ): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      id: `ltm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: "long",
      content,
      metadata: {
        timestamp: Date.now(),
        workspaceId: metadata.workspaceId!,
        userId: metadata.userId,
        importance: metadata.importance || 0.7,
        accessCount: 0,
        lastAccessed: Date.now(),
      },
    };
    
    // Generate embedding
    const embedding = await embeddingEngine.generate({
      texts: [content],
    });
    
    // Store in vector database
    await qdrantService.insert({
      collection: `memory-workspace-${metadata.workspaceId}`,
      vectors: embedding.embeddings,
      payloads: [
        {
          id: entry.id,
          type: entry.type,
          content: entry.content,
          ...entry.metadata,
        },
      ],
    });
    
    return entry;
  }
  
  /**
   * Retrieve relevant long-term memories
   */
  async retrieveLongTermMemory(
    query: string,
    workspaceId: number,
    limit = 5
  ): Promise<Array<{ entry: MemoryEntry; score: number }>> {
    // Generate query embedding
    const queryEmbedding = await embeddingEngine.generate({
      texts: [query],
    });
    
    // Search in vector database
    const results = await qdrantService.search({
      collection: `memory-workspace-${workspaceId}`,
      query: queryEmbedding.embeddings[0],
      limit,
      filter: {
        must: [
          {
            key: "type",
            match: {
              value: "long",
            },
          },
        ],
      },
    });
    
    // Update access count and last accessed
    // (In production, this would update the database)
    
    return results.map((r) => ({
      entry: {
        id: r.payload.id,
        type: r.payload.type,
        content: r.payload.content,
        metadata: {
          timestamp: r.payload.timestamp,
          workspaceId: r.payload.workspaceId,
          userId: r.payload.userId,
          importance: r.payload.importance,
          accessCount: (r.payload.accessCount || 0) + 1,
          lastAccessed: Date.now(),
        },
      },
      score: r.score,
    }));
  }
  
  /**
   * Rank memories by importance and relevance
   */
  rankMemories(
    memories: Array<{ entry: MemoryEntry; score: number }>
  ): Array<{ entry: MemoryEntry; score: number; rank: number }> {
    // Calculate composite score: relevance * importance * recency
    const now = Date.now();
    const ranked = memories.map((mem) => {
      const recencyScore = 1 / (1 + (now - mem.entry.metadata.timestamp) / 86400000); // Decay over days
      const importanceScore = mem.entry.metadata.importance || 0.5;
      const compositeScore = mem.score * importanceScore * recencyScore;
      
      return {
        ...mem,
        rank: compositeScore,
      };
    });
    
    // Sort by rank descending
    return ranked.sort((a, b) => b.rank - a.rank);
  }
  
  /**
   * Summarize conversation memory
   */
  async summarizeConversation(conversationId: string): Promise<MemorySummary> {
    const memory = this.getShortTermMemory(conversationId);
    
    if (memory.length === 0) {
      return {
        id: `summary-${Date.now()}`,
        originalEntries: [],
        summary: "No conversation history to summarize.",
        timestamp: Date.now(),
      };
    }
    
    // Combine all entries
    const combined = memory.map((m) => m.content).join("\n\n");
    
    // In production, this would use LLM to generate summary
    // For now, create a simple summary
    const summary = `Conversation summary: ${memory.length} messages exchanged. Topics discussed include various queries and responses.`;
    
    return {
      id: `summary-${Date.now()}`,
      originalEntries: memory.map((m) => m.id),
      summary,
      timestamp: Date.now(),
    };
  }
  
  /**
   * Clear short-term memory for a conversation
   */
  clearShortTermMemory(conversationId: string): void {
    this.shortTermMemory.delete(conversationId);
  }
  
  /**
   * Get memory statistics
   */
  getStats(workspaceId: number): {
    shortTermCount: number;
    longTermCount: number;
    totalConversations: number;
  } {
    const shortTermCount = Array.from(this.shortTermMemory.values()).reduce(
      (sum, mem) => sum + mem.filter((m) => m.metadata.workspaceId === workspaceId).length,
      0
    );
    
    return {
      shortTermCount,
      longTermCount: 0, // Would query vector database
      totalConversations: this.shortTermMemory.size,
    };
  }
}

export const memorySystem = new MemorySystem();
