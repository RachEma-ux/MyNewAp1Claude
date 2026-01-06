/**
 * Knowledge Packs Service
 * Manages shareable knowledge packages with versioning
 */

import * as fs from "fs/promises";
import * as path from "path";

export interface KnowledgePack {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  createdAt: number;
  updatedAt: number;
  
  // Content
  documents: KnowledgeDocument[];
  embeddings: KnowledgeEmbedding[];
  metadata: Record<string, any>;
  
  // Versioning
  previousVersion?: string;
  changelog?: string;
}

export interface KnowledgeDocument {
  id: string;
  filename: string;
  format: string;
  content: string;
  chunks: DocumentChunk[];
}

export interface DocumentChunk {
  id: string;
  text: string;
  index: number;
  metadata: Record<string, any>;
}

export interface KnowledgeEmbedding {
  chunkId: string;
  vector: number[];
  model: string;
}

/**
 * Knowledge Packs Manager
 */
class KnowledgePacksService {
  private readonly PACKS_DIR = "/tmp/knowledge-packs";
  
  constructor() {
    this.ensurePacksDir();
  }
  
  private async ensurePacksDir(): Promise<void> {
    try {
      await fs.mkdir(this.PACKS_DIR, { recursive: true });
    } catch (error) {
      console.error("[KnowledgePacks] Failed to create packs directory:", error);
    }
  }
  
  /**
   * Create a new knowledge pack
   */
  async createPack(
    name: string,
    description: string,
    author: string,
    documents: KnowledgeDocument[],
    embeddings: KnowledgeEmbedding[]
  ): Promise<KnowledgePack> {
    const pack: KnowledgePack = {
      id: `pack-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      version: "1.0.0",
      author,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      documents,
      embeddings,
      metadata: {},
    };
    
    // Save to disk
    await this.savePack(pack);
    
    return pack;
  }
  
  /**
   * Load a knowledge pack
   */
  async loadPack(packId: string): Promise<KnowledgePack | null> {
    try {
      const packPath = path.join(this.PACKS_DIR, `${packId}.json`);
      const content = await fs.readFile(packPath, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      console.error(`[KnowledgePacks] Failed to load pack ${packId}:`, error);
      return null;
    }
  }
  
  /**
   * Save a knowledge pack
   */
  private async savePack(pack: KnowledgePack): Promise<void> {
    const packPath = path.join(this.PACKS_DIR, `${pack.id}.json`);
    await fs.writeFile(packPath, JSON.stringify(pack, null, 2), "utf-8");
  }
  
  /**
   * Update a knowledge pack (creates new version)
   */
  async updatePack(
    packId: string,
    updates: Partial<Pick<KnowledgePack, "name" | "description" | "documents" | "embeddings">>,
    changelog: string
  ): Promise<KnowledgePack | null> {
    const existingPack = await this.loadPack(packId);
    if (!existingPack) return null;
    
    // Increment version
    const [major, minor, patch] = existingPack.version.split(".").map(Number);
    const newVersion = `${major}.${minor}.${patch + 1}`;
    
    const updatedPack: KnowledgePack = {
      ...existingPack,
      ...updates,
      version: newVersion,
      updatedAt: Date.now(),
      previousVersion: existingPack.version,
      changelog,
    };
    
    await this.savePack(updatedPack);
    
    return updatedPack;
  }
  
  /**
   * Export knowledge pack to file
   */
  async exportPack(packId: string, outputPath: string): Promise<boolean> {
    const pack = await this.loadPack(packId);
    if (!pack) return false;
    
    try {
      await fs.writeFile(outputPath, JSON.stringify(pack, null, 2), "utf-8");
      return true;
    } catch (error) {
      console.error(`[KnowledgePacks] Failed to export pack ${packId}:`, error);
      return false;
    }
  }
  
  /**
   * Import knowledge pack from file
   */
  async importPack(filePath: string): Promise<KnowledgePack | null> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const pack: KnowledgePack = JSON.parse(content);
      
      // Validate pack structure
      if (!pack.id || !pack.name || !pack.version) {
        throw new Error("Invalid knowledge pack structure");
      }
      
      // Save imported pack
      await this.savePack(pack);
      
      return pack;
    } catch (error) {
      console.error("[KnowledgePacks] Failed to import pack:", error);
      return null;
    }
  }
  
  /**
   * List all knowledge packs
   */
  async listPacks(): Promise<Array<Pick<KnowledgePack, "id" | "name" | "description" | "version" | "author" | "createdAt">>> {
    try {
      const files = await fs.readdir(this.PACKS_DIR);
      const packs: Array<Pick<KnowledgePack, "id" | "name" | "description" | "version" | "author" | "createdAt">> = [];
      
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        
        const packPath = path.join(this.PACKS_DIR, file);
        const content = await fs.readFile(packPath, "utf-8");
        const pack: KnowledgePack = JSON.parse(content);
        
        packs.push({
          id: pack.id,
          name: pack.name,
          description: pack.description,
          version: pack.version,
          author: pack.author,
          createdAt: pack.createdAt,
        });
      }
      
      return packs.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error("[KnowledgePacks] Failed to list packs:", error);
      return [];
    }
  }
  
  /**
   * Delete a knowledge pack
   */
  async deletePack(packId: string): Promise<boolean> {
    try {
      const packPath = path.join(this.PACKS_DIR, `${packId}.json`);
      await fs.unlink(packPath);
      return true;
    } catch (error) {
      console.error(`[KnowledgePacks] Failed to delete pack ${packId}:`, error);
      return false;
    }
  }
  
  /**
   * Get pack version history
   */
  async getVersionHistory(packId: string): Promise<Array<{ version: string; changelog?: string; timestamp: number }>> {
    const pack = await this.loadPack(packId);
    if (!pack) return [];
    
    const history: Array<{ version: string; changelog?: string; timestamp: number }> = [
      {
        version: pack.version,
        changelog: pack.changelog,
        timestamp: pack.updatedAt,
      },
    ];
    
    // In production, this would traverse previousVersion links
    // For now, just return current version
    
    return history;
  }
  
  /**
   * Search knowledge packs
   */
  async searchPacks(query: string): Promise<Array<Pick<KnowledgePack, "id" | "name" | "description" | "version">>> {
    const allPacks = await this.listPacks();
    const lowerQuery = query.toLowerCase();
    
    return allPacks
      .filter(
        (pack) =>
          pack.name.toLowerCase().includes(lowerQuery) ||
          pack.description.toLowerCase().includes(lowerQuery)
      )
      .map((pack) => ({
        id: pack.id,
        name: pack.name,
        description: pack.description,
        version: pack.version,
      }));
  }
}

export const knowledgePacksService = new KnowledgePacksService();
