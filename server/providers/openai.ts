// Provider Hub - OpenAI Provider Implementation

import OpenAI from 'openai';
import { BaseProvider } from './base';
import type {
  GenerationRequest,
  GenerationResponse,
  Token,
  EmbedOptions,
  Embedding,
  ProviderCapabilities,
  CostProfile,
  ProviderConfig,
} from './types';

export class OpenAIProvider extends BaseProvider {
  private client: OpenAI | null = null;

  constructor(config: ProviderConfig) {
    super(config);
  }

  protected async doInitialize(): Promise<void> {
    const apiKey = this.requireConfigValue<string>('apiKey');
    const baseURL = this.getConfigValue<string>('baseURL', 'https://api.openai.com/v1');
    
    this.client = new OpenAI({
      apiKey,
      baseURL,
    });
  }

  protected async doCleanup(): Promise<void> {
    this.client = null;
  }

  protected async doHealthCheck(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      // Simple health check - list models
      await this.client.models.list();
      return true;
    } catch (error) {
      console.error('[OpenAIProvider] Health check failed:', error);
      return false;
    }
  }

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized');
    }

    const startTime = Date.now();
    const model = request.model || this.getConfigValue<string>('defaultModel', 'gpt-4o-mini');

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages: request.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        top_p: request.topP,
        stop: request.stopSequences,
        stream: false,
      });

      const latencyMs = Date.now() - startTime;
      const choice = response.choices[0];
      if (!choice) {
        throw new Error('No response from OpenAI');
      }

      const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      const costProfile = this.getCostPerToken();
      const cost = (
        (usage.prompt_tokens / 1000) * costProfile.inputCostPer1kTokens +
        (usage.completion_tokens / 1000) * costProfile.outputCostPer1kTokens
      );

      return {
        id: response.id,
        content: choice.message?.content || '',
        model: response.model,
        usage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
        finishReason: this.mapFinishReason(choice.finish_reason),
        latencyMs,
        cost,
      };
    } catch (error) {
      console.error('[OpenAIProvider] Generation error:', error);
      throw error;
    }
  }

  async *generateStream(request: GenerationRequest): AsyncGenerator<Token, void, unknown> {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized');
    }

    const model = request.model || this.getConfigValue<string>('defaultModel', 'gpt-4o-mini');

    try {
      const stream = await this.client.chat.completions.create({
        model,
        messages: request.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        top_p: request.topP,
        stop: request.stopSequences,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          yield {
            content: delta.content,
            isComplete: false,
          };
        }
      }

      yield {
        content: '',
        isComplete: true,
      };
    } catch (error) {
      console.error('[OpenAIProvider] Stream generation error:', error);
      throw error;
    }
  }

  async embed(texts: string[], options?: EmbedOptions): Promise<Embedding[]> {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized');
    }

    const model = options?.model || this.getConfigValue<string>('embeddingModel', 'text-embedding-3-small');

    try {
      const response = await this.client.embeddings.create({
        model,
        input: texts,
        dimensions: options?.dimensions,
      });

      return response.data.map(item => ({
        vector: item.embedding,
        model: response.model,
        dimensions: item.embedding.length,
      }));
    } catch (error) {
      console.error('[OpenAIProvider] Embedding error:', error);
      throw error;
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsEmbedding: true,
      supportsFunctionCalling: true,
      supportsVision: true,
      maxContextLength: 128000, // gpt-4o
      supportedModels: [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-3.5-turbo',
        'text-embedding-3-small',
        'text-embedding-3-large',
      ],
    };
  }

  getCostPerToken(): CostProfile {
    const model = this.getConfigValue<string>('defaultModel', 'gpt-4o-mini');
    
    // Pricing as of Dec 2024 (per 1k tokens)
    const pricing: Record<string, CostProfile> = {
      'gpt-4o': {
        inputCostPer1kTokens: 0.0025,
        outputCostPer1kTokens: 0.01,
        embeddingCostPer1kTokens: 0,
      },
      'gpt-4o-mini': {
        inputCostPer1kTokens: 0.00015,
        outputCostPer1kTokens: 0.0006,
        embeddingCostPer1kTokens: 0,
      },
      'gpt-4-turbo': {
        inputCostPer1kTokens: 0.01,
        outputCostPer1kTokens: 0.03,
        embeddingCostPer1kTokens: 0,
      },
      'gpt-3.5-turbo': {
        inputCostPer1kTokens: 0.0005,
        outputCostPer1kTokens: 0.0015,
        embeddingCostPer1kTokens: 0,
      },
      'text-embedding-3-small': {
        inputCostPer1kTokens: 0,
        outputCostPer1kTokens: 0,
        embeddingCostPer1kTokens: 0.00002,
      },
      'text-embedding-3-large': {
        inputCostPer1kTokens: 0,
        outputCostPer1kTokens: 0,
        embeddingCostPer1kTokens: 0.00013,
      },
    };

    return pricing[model] || pricing['gpt-4o-mini']!;
  }

  private mapFinishReason(reason: string | null | undefined): 'stop' | 'length' | 'content_filter' | 'error' {
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
