import { BaseProvider } from './base';
import type { 
  Message, 
  ProviderConfig, 
  GenerationRequest, 
  GenerationResponse, 
  Token,
  ProviderCapabilities,
  CostProfile,
  LatencyProfile,
  EmbedOptions,
  Embedding,
  HealthStatus,
} from './types';

/**
 * Ollama Provider - connects to local Ollama instance
 * Requires Ollama to be running on localhost:11434
 */
export class OllamaProvider extends BaseProvider {
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: ProviderConfig) {
    super(config);
    
    // Get Ollama base URL from config or use default
    this.baseUrl = (config.config.apiEndpoint as string) || 'http://localhost:11434';
    this.defaultModel = (config.config.defaultModel as string) || 'llama2';
  }

  protected async doInitialize(): Promise<void> {
    // Test connection to Ollama
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Ollama server returned ${response.status}`);
      }

      const data = await response.json();
      console.log(`[Ollama] Connected successfully. Available models: ${data.models?.length || 0}`);
    } catch (error) {
      throw new Error(
        `Failed to connect to Ollama at ${this.baseUrl}. ` +
        `Please ensure Ollama is running (install from https://ollama.ai). ` +
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  protected async doCleanup(): Promise<void> {
    // No cleanup needed for Ollama
  }

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const model = request.model || this.defaultModel;
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: request.messages.map((m: Message) => ({
            role: m.role,
            content: m.content,
          })),
          stream: false,
          options: {
            temperature: request.temperature,
            num_predict: request.maxTokens,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      return {
        id: `ollama-${Date.now()}`,
        content: data.message?.content || '',
        model,
        usage: {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
        finishReason: 'stop',
        latencyMs,
        cost: 0, // Local models are free
      };
    } catch (error) {
      console.error('[Ollama] Generation error:', error);
      throw new Error(
        `Ollama generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async *generateStream(request: GenerationRequest): AsyncGenerator<Token> {
    const model = request.model || this.defaultModel;

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: request.messages.map((m: Message) => ({
            role: m.role,
            content: m.content,
          })),
          stream: true,
          options: {
            temperature: request.temperature,
            num_predict: request.maxTokens,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line);
            
            if (data.message?.content) {
              yield {
                content: data.message.content,
                isComplete: false,
              };
            }

            if (data.done) {
              yield {
                content: '',
                isComplete: true,
              };
            }
          } catch (parseError) {
            console.error('[Ollama] Failed to parse streaming response:', line);
          }
        }
      }
    } catch (error) {
      console.error('[Ollama] Streaming error:', error);
      throw new Error(
        `Ollama streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  getCostPerToken(): { inputCostPer1kTokens: number; outputCostPer1kTokens: number } {
    // Local models are free
    return {
      inputCostPer1kTokens: 0,
      outputCostPer1kTokens: 0,
    };
  }

  getMaxContextLength(): number {
    // Default context length for most Ollama models
    // This can be overridden in config
    return 4096;
  }

  getSupportedModels(): string[] {
    // Common Ollama models
    // In a real implementation, we could fetch this from /api/tags
    return [
      'llama2',
      'llama2:13b',
      'llama2:70b',
      'mistral',
      'mixtral',
      'codellama',
      'phi',
      'neural-chat',
      'starling-lm',
      'orca-mini',
    ];
  }

  async embed(texts: string[], options?: EmbedOptions): Promise<Embedding[]> {
    // Ollama supports embeddings via /api/embeddings endpoint
    const model = options?.model || 'nomic-embed-text';

    try {
      const embeddings: Embedding[] = [];

      for (const text of texts) {
        const response = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            prompt: text,
          }),
        });

        if (!response.ok) {
          throw new Error(`Ollama embeddings API error: ${response.status}`);
        }

        const data = await response.json();
        embeddings.push({
          vector: data.embedding,
          model,
          dimensions: data.embedding.length,
        });
      }

      return embeddings;
    } catch (error) {
      console.error('[Ollama] Embedding error:', error);
      throw new Error(
        `Ollama embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsEmbedding: true,
      supportsFunctionCalling: false,
      supportsVision: false,
      maxContextLength: this.getMaxContextLength(),
      supportedModels: this.getSupportedModels(),
    };
  }

  protected async doHealthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });

      return response.ok;
    } catch (error) {
      console.error('[Ollama] Health check failed:', error);
      return false;
    }
  }
}
