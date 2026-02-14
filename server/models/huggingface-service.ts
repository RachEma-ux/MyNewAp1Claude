/**
 * HuggingFace API Integration
 * Provides access to HuggingFace model hub for browsing and downloading models
 */

export interface HFModelInfo {
  id: string;
  modelId: string;
  author: string;
  sha: string;
  lastModified: string;
  private: boolean;
  downloads: number;
  likes: number;
  tags: string[];
  pipeline_tag?: string;
  library_name?: string;
  card?: string; // README content
  siblings?: Array<{
    rfilename: string;
    size?: number;
  }>;
}

export interface HFSearchParams {
  query?: string;
  author?: string;
  filter?: string; // e.g., "text-generation", "text2text-generation"
  sort?: "downloads" | "likes" | "lastModified";
  direction?: "asc" | "desc";
  limit?: number;
}

export interface HFDownloadOptions {
  modelId: string;
  filename?: string; // Specific file to download
  revision?: string; // Branch/tag/commit
  cache?: boolean;
}

/**
 * HuggingFace Service
 */
class HuggingFaceService {
  private readonly API_BASE = "https://huggingface.co/api";
  private readonly HUB_BASE = "https://huggingface.co";
  private apiToken?: string;

  constructor(apiToken?: string) {
    this.apiToken = apiToken;
  }

  /**
   * Set API token for authenticated requests
   */
  setApiToken(token: string): void {
    this.apiToken = token;
  }

  /**
   * Search models on HuggingFace Hub
   */
  async searchModels(params: HFSearchParams = {}): Promise<HFModelInfo[]> {
    const {
      query = "",
      author,
      filter,
      sort = "downloads",
      direction = "desc",
      limit = 20,
    } = params;

    const searchParams = new URLSearchParams();
    if (query) searchParams.set("search", query);
    if (author) searchParams.set("author", author);
    if (filter) searchParams.set("filter", filter);
    searchParams.set("sort", sort);
    searchParams.set("direction", direction === "desc" ? "-1" : "1");
    searchParams.set("limit", limit.toString());

    const url = `${this.API_BASE}/models?${searchParams.toString()}`;

    try {
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HuggingFace API error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("[HuggingFace] Search failed:", error);
      throw error;
    }
  }

  /**
   * Get model information
   */
  async getModelInfo(modelId: string): Promise<HFModelInfo> {
    const url = `${this.API_BASE}/models/${modelId}`;

    try {
      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HuggingFace API error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[HuggingFace] Failed to get model info for ${modelId}:`, error);
      throw error;
    }
  }

  /**
   * Get model files list
   */
  async getModelFiles(modelId: string, revision = "main"): Promise<Array<{ filename: string; size: number }>> {
    try {
      const modelInfo = await this.getModelInfo(modelId);
      
      if (!modelInfo.siblings) {
        return [];
      }

      return modelInfo.siblings.map((file) => ({
        filename: file.rfilename,
        size: file.size || 0,
      }));
    } catch (error) {
      console.error(`[HuggingFace] Failed to get model files for ${modelId}:`, error);
      throw error;
    }
  }

  /**
   * Get download URL for a model file
   */
  getDownloadUrl(modelId: string, filename: string, revision = "main"): string {
    return `${this.HUB_BASE}/${modelId}/resolve/${revision}/${filename}`;
  }

  /**
   * Get model README
   */
  async getModelReadme(modelId: string): Promise<string> {
    const url = `${this.HUB_BASE}/${modelId}/raw/main/README.md`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        return ""; // README not found
      }

      return await response.text();
    } catch (error) {
      console.error(`[HuggingFace] Failed to get README for ${modelId}:`, error);
      return "";
    }
  }

  /**
   * Search for GGUF models specifically
   */
  async searchGGUFModels(query?: string, limit = 20): Promise<HFModelInfo[]> {
    return this.searchModels({
      query: query ? `${query} gguf` : "gguf",
      filter: "text-generation",
      sort: "downloads",
      direction: "desc",
      limit,
    });
  }

  /**
   * Get popular LLM models
   */
  async getPopularLLMs(limit = 20): Promise<HFModelInfo[]> {
    return this.searchModels({
      filter: "text-generation",
      sort: "downloads",
      direction: "desc",
      limit,
    });
  }

  /**
   * Get models by author
   */
  async getModelsByAuthor(author: string, limit = 20): Promise<HFModelInfo[]> {
    return this.searchModels({
      author,
      sort: "downloads",
      direction: "desc",
      limit,
    });
  }

  /**
   * Check if model exists
   */
  async modelExists(modelId: string): Promise<boolean> {
    try {
      await this.getModelInfo(modelId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get model size (total size of all files)
   */
  async getModelSize(modelId: string): Promise<number> {
    try {
      const files = await this.getModelFiles(modelId);
      return files.reduce((total, file) => total + file.size, 0);
    } catch {
      return 0;
    }
  }

  /**
   * Get recommended models for different use cases
   */
  async getRecommendedModels(useCase: "chat" | "code" | "instruct" | "embedding"): Promise<HFModelInfo[]> {
    const filters: Record<string, string> = {
      chat: "conversational",
      code: "code",
      instruct: "text-generation",
      embedding: "feature-extraction",
    };

    return this.searchModels({
      filter: filters[useCase] || "text-generation",
      sort: "downloads",
      direction: "desc",
      limit: 10,
    });
  }

  /**
   * Get headers for API requests
   */
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (this.apiToken) {
      headers["Authorization"] = `Bearer ${this.apiToken}`;
    }

    return headers;
  }

  /**
   * Parse model ID into author and name
   */
  static parseModelId(modelId: string): { author: string; name: string } {
    const parts = modelId.split("/");
    if (parts.length !== 2) {
      throw new Error(`Invalid model ID format: ${modelId}`);
    }
    return {
      author: parts[0],
      name: parts[1],
    };
  }

  /**
   * Format model size to human-readable string
   */
  static formatSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Estimate model parameters from size (rough heuristic)
   */
  static estimateParameters(sizeBytes: number): string {
    // Rough estimate: 1B parameters ≈ 2GB for FP16
    const billions = sizeBytes / (2 * 1024 * 1024 * 1024);
    
    if (billions < 1) {
      return `${(billions * 1000).toFixed(0)}M`;
    } else {
      return `${billions.toFixed(1)}B`;
    }
  }
}

// Singleton instance
export const huggingFaceService = new HuggingFaceService();

/**
 * Popular model collections
 */
export const POPULAR_MODELS = {
  chat: [
    "meta-llama/Llama-2-7b-chat-hf",
    "meta-llama/Llama-3.2-3B-Instruct",
    "mistralai/Mistral-7B-Instruct-v0.3",
    "Qwen/Qwen3-8B",
  ],
  code: [
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-8B",
    "Qwen/Qwen2.5-Coder-7B-Instruct",
    "google/gemma-3-4b-it",
  ],
  embedding: [
    "BAAI/bge-large-en-v1.5",
    "BAAI/bge-base-en-v1.5",
    "sentence-transformers/all-MiniLM-L6-v2",
  ],
  gguf: [
    "TheBloke/Llama-2-7B-Chat-GGUF",
    "TheBloke/Mistral-7B-Instruct-v0.2-GGUF",
    "TheBloke/CodeLlama-7B-GGUF",
  ],
};
