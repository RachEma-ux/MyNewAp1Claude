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
 * Custom Provider - connects to any OpenAI-compatible API
 * Works with DeepSeek, Mistral, xAI, Cohere, Perplexity, Together AI,
 * Groq, Fireworks, and any other OpenAI-compatible endpoint.
 */
export class CustomProvider extends BaseProvider {
  private baseUrl: string;
  private apiKey: string;
  private defaultModel: string;
  private availableModels: string[] = [];

  constructor(config: ProviderConfig) {
    super(config);

    this.baseUrl = ((config.config.baseUrl || config.config.apiEndpoint) as string) || '';
    this.apiKey = (config.config.apiKey as string) || '';
    this.defaultModel = (config.config.defaultModel as string) || '';

    // Normalize base URL - strip trailing slash
    if (this.baseUrl.endsWith('/')) {
      this.baseUrl = this.baseUrl.slice(0, -1);
    }
  }

  protected async doInitialize(): Promise<void> {
    if (!this.baseUrl) {
      throw new Error('Custom provider requires a base URL (e.g. https://api.example.com/v1)');
    }

    // Try to fetch available models
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        this.availableModels = (data.data || data.models || [])
          .map((m: { id?: string; name?: string }) => m.id || m.name)
          .filter(Boolean);
        console.log(`[Custom] Connected to ${this.baseUrl}. Available models: ${this.availableModels.length}`);
      } else {
        // /models endpoint is optional - provider may still work
        console.log(`[Custom] Connected to ${this.baseUrl}. Models endpoint not available.`);
      }
    } catch (error) {
      throw new Error(
        `Failed to connect to custom provider at ${this.baseUrl}. ` +
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

    if (!model) {
      throw new Error('No model specified. Set a default model or pass one in the request.');
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
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
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;
      const choice = data.choices?.[0];

      return {
        id: data.id || `custom-${Date.now()}`,
        content: choice?.message?.content || '',
        model: data.model || model,
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
        finishReason: this.mapFinishReason(choice?.finish_reason),
        latencyMs,
      };
    } catch (error) {
      console.error('[Custom] Generation error:', error);
      throw new Error(
        `Custom provider generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async *generateStream(request: GenerationRequest): AsyncGenerator<Token> {
    const model = request.model || this.defaultModel;

    if (!model) {
      throw new Error('No model specified. Set a default model or pass one in the request.');
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
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
        throw new Error(`API error: ${response.status} - ${errorText}`);
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
            console.error('[Custom] Failed to parse streaming response:', data);
          }
        }
      }
    } catch (error) {
      console.error('[Custom] Streaming error:', error);
      throw new Error(
        `Custom provider streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  getCostPerToken(): { inputCostPer1kTokens: number; outputCostPer1kTokens: number } {
    // Cost depends on the specific provider - default to 0, can be overridden via config
    return {
      inputCostPer1kTokens: (this.config.config.inputCostPer1kTokens as number) || 0,
      outputCostPer1kTokens: (this.config.config.outputCostPer1kTokens as number) || 0,
    };
  }

  getMaxContextLength(): number {
    return (this.config.config.maxContextLength as number) || 128000;
  }

  getSupportedModels(): string[] {
    if (this.availableModels.length > 0) {
      return this.availableModels;
    }
    if (this.defaultModel) {
      return [this.defaultModel];
    }
    return [];
  }

  async embed(texts: string[], options?: EmbedOptions): Promise<Embedding[]> {
    const model = options?.model || this.defaultModel;

    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model,
          input: texts,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 404) {
          throw new Error('Embeddings endpoint not available on this provider.');
        }
        throw new Error(`Embeddings API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      return data.data.map((item: { embedding: number[] }) => ({
        vector: item.embedding,
        model: data.model || model,
        dimensions: item.embedding.length,
      }));
    } catch (error) {
      console.error('[Custom] Embedding error:', error);
      throw new Error(
        `Custom provider embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsEmbedding: (this.config.config.supportsEmbedding as boolean) ?? true,
      supportsFunctionCalling: (this.config.config.supportsFunctionCalling as boolean) ?? false,
      supportsVision: (this.config.config.supportsVision as boolean) ?? false,
      maxContextLength: this.getMaxContextLength(),
      supportedModels: this.getSupportedModels(),
    };
  }

  protected async doHealthCheck(): Promise<boolean> {
    try {
      // Try /models first as a health indicator
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch (error) {
      console.error('[Custom] Health check failed:', error);
      return false;
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
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
