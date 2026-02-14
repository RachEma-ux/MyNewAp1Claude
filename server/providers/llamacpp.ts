import { BaseProvider } from './base';
import type {
  Message,
  ProviderConfig,
  GenerationRequest,
  GenerationResponse,
  Token,
  ProviderCapabilities,
  EmbedOptions,
  Embedding,
} from './types';

/**
 * llama.cpp Provider - connects to a local llama.cpp server
 * llama.cpp exposes an OpenAI-compatible API at localhost:8080
 * Start with: llama-server -m model.gguf --port 8080
 */
export class LlamaCppProvider extends BaseProvider {
  private baseUrl: string;
  private defaultModel: string;
  private loadedModel: string | null = null;

  constructor(config: ProviderConfig) {
    super(config);

    this.baseUrl = (config.config.apiEndpoint as string) || 'http://localhost:8080';
    this.defaultModel = (config.config.defaultModel as string) || 'default';
  }

  protected async doInitialize(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);

      if (!response.ok) {
        throw new Error(`llama.cpp server returned ${response.status}`);
      }

      const data = await response.json();
      this.loadedModel = data.model_path || data.model || null;
      console.log(
        `[llama.cpp] Connected successfully.${this.loadedModel ? ` Model: ${this.loadedModel}` : ''}`
      );
    } catch (error) {
      throw new Error(
        `Failed to connect to llama.cpp at ${this.baseUrl}. ` +
        `Please ensure llama-server is running (build from https://github.com/ggerganov/llama.cpp). ` +
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  protected async doCleanup(): Promise<void> {
    // No cleanup needed
  }

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const model = request.model || this.defaultModel;
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
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
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          top_p: request.topP,
          stop: request.stopSequences,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`llama.cpp API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;
      const choice = data.choices?.[0];

      return {
        id: data.id || `llamacpp-${Date.now()}`,
        content: choice?.message?.content || '',
        model: data.model || model,
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
        finishReason: this.mapFinishReason(choice?.finish_reason),
        latencyMs,
        cost: 0,
      };
    } catch (error) {
      console.error('[llama.cpp] Generation error:', error);
      throw new Error(
        `llama.cpp generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async *generateStream(request: GenerationRequest): AsyncGenerator<Token> {
    const model = request.model || this.defaultModel;

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
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
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          top_p: request.topP,
          stop: request.stopSequences,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`llama.cpp API error: ${response.status} - ${errorText}`);
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
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            yield { content: '', isComplete: true };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;

            if (delta?.content) {
              yield {
                content: delta.content,
                isComplete: false,
              };
            }

            if (parsed.choices?.[0]?.finish_reason) {
              yield { content: '', isComplete: true };
            }
          } catch (parseError) {
            console.error('[llama.cpp] Failed to parse streaming response:', data);
          }
        }
      }
    } catch (error) {
      console.error('[llama.cpp] Streaming error:', error);
      throw new Error(
        `llama.cpp streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  getCostPerToken(): { inputCostPer1kTokens: number; outputCostPer1kTokens: number } {
    return {
      inputCostPer1kTokens: 0,
      outputCostPer1kTokens: 0,
    };
  }

  getMaxContextLength(): number {
    return 128000;
  }

  getSupportedModels(): string[] {
    if (this.loadedModel) {
      return [this.loadedModel];
    }
    return [
      'smollm2-1.7b',
      'llama-4-scout',
      'qwen3-8b',
      'deepseek-r1-8b',
      'gemma-3-4b',
      'mistral-7b',
      'phi-4-mini',
    ];
  }

  async embed(texts: string[], options?: EmbedOptions): Promise<Embedding[]> {
    const model = options?.model || this.defaultModel;

    try {
      const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: texts,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        // llama.cpp might not have embeddings enabled
        if (response.status === 404) {
          throw new Error(
            'Embeddings not available. Start llama-server with --embedding flag.'
          );
        }
        throw new Error(`llama.cpp embeddings API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      return data.data.map((item: { embedding: number[] }) => ({
        vector: item.embedding,
        model: data.model || model,
        dimensions: item.embedding.length,
      }));
    } catch (error) {
      console.error('[llama.cpp] Embedding error:', error);
      throw new Error(
        `llama.cpp embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsEmbedding: true,
      supportsFunctionCalling: false,
      supportsVision: true,
      maxContextLength: this.getMaxContextLength(),
      supportedModels: this.getSupportedModels(),
    };
  }

  protected async doHealthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch (error) {
      console.error('[llama.cpp] Health check failed:', error);
      return false;
    }
  }

  private mapFinishReason(reason?: string): 'stop' | 'length' | 'content_filter' | 'error' {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}
