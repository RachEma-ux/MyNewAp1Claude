// Provider Hub - Anthropic Provider Implementation

import Anthropic from '@anthropic-ai/sdk';
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

export class AnthropicProvider extends BaseProvider {
  private client: Anthropic | null = null;

  constructor(config: ProviderConfig) {
    super(config);
  }

  protected async doInitialize(): Promise<void> {
    const apiKey = this.requireConfigValue<string>('apiKey');
    
    this.client = new Anthropic({
      apiKey,
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
      // Simple health check - create a minimal request
      await this.client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }],
      });
      return true;
    } catch (error) {
      console.error('[AnthropicProvider] Health check failed:', error);
      return false;
    }
  }

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    if (!this.client) {
      throw new Error('Anthropic provider not initialized');
    }

    const startTime = Date.now();
    const model = request.model || this.getConfigValue<string>('defaultModel', 'claude-3-5-sonnet-20241022');

    try {
      // Extract system message if present
      const systemMessage = request.messages.find(m => m.role === 'system');
      const userMessages = request.messages.filter(m => m.role !== 'system');

      const response = await this.client.messages.create({
        model,
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 1.0,
        top_p: request.topP,
        stop_sequences: request.stopSequences,
        system: systemMessage?.content,
        messages: userMessages.map(msg => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        })),
      });

      const latencyMs = Date.now() - startTime;
      const content = response.content[0];
      if (!content || content.type !== 'text') {
        throw new Error('No text response from Anthropic');
      }

      const usage = response.usage;
      const costProfile = this.getCostPerToken();
      const cost = (
        (usage.input_tokens / 1000) * costProfile.inputCostPer1kTokens +
        (usage.output_tokens / 1000) * costProfile.outputCostPer1kTokens
      );

      return {
        id: response.id,
        content: content.text,
        model: response.model,
        usage: {
          promptTokens: usage.input_tokens,
          completionTokens: usage.output_tokens,
          totalTokens: usage.input_tokens + usage.output_tokens,
        },
        finishReason: this.mapStopReason(response.stop_reason),
        latencyMs,
        cost,
      };
    } catch (error) {
      console.error('[AnthropicProvider] Generation error:', error);
      throw error;
    }
  }

  async *generateStream(request: GenerationRequest): AsyncGenerator<Token, void, unknown> {
    if (!this.client) {
      throw new Error('Anthropic provider not initialized');
    }

    const model = request.model || this.getConfigValue<string>('defaultModel', 'claude-3-5-sonnet-20241022');

    try {
      // Extract system message if present
      const systemMessage = request.messages.find(m => m.role === 'system');
      const userMessages = request.messages.filter(m => m.role !== 'system');

      const stream = await this.client.messages.create({
        model,
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 1.0,
        top_p: request.topP,
        stop_sequences: request.stopSequences,
        system: systemMessage?.content,
        messages: userMessages.map(msg => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        })),
        stream: true,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield {
            content: event.delta.text,
            isComplete: false,
          };
        }
      }

      yield {
        content: '',
        isComplete: true,
      };
    } catch (error) {
      console.error('[AnthropicProvider] Stream generation error:', error);
      throw error;
    }
  }

  async embed(_texts: string[], _options?: EmbedOptions): Promise<Embedding[]> {
    throw new Error('Anthropic does not support embeddings. Use OpenAI or Google for embeddings.');
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsEmbedding: false,
      supportsFunctionCalling: true,
      supportsVision: true,
      maxContextLength: 200000, // Claude 3.5 Sonnet
      supportedModels: [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
      ],
    };
  }

  getCostPerToken(): CostProfile {
    const model = this.getConfigValue<string>('defaultModel', 'claude-3-5-sonnet-20241022');
    
    // Pricing as of Dec 2024 (per 1M tokens, converted to per 1k)
    const pricing: Record<string, CostProfile> = {
      'claude-3-5-sonnet-20241022': {
        inputCostPer1kTokens: 0.003,
        outputCostPer1kTokens: 0.015,
      },
      'claude-3-5-haiku-20241022': {
        inputCostPer1kTokens: 0.0008,
        outputCostPer1kTokens: 0.004,
      },
      'claude-3-opus-20240229': {
        inputCostPer1kTokens: 0.015,
        outputCostPer1kTokens: 0.075,
      },
      'claude-3-sonnet-20240229': {
        inputCostPer1kTokens: 0.003,
        outputCostPer1kTokens: 0.015,
      },
      'claude-3-haiku-20240307': {
        inputCostPer1kTokens: 0.00025,
        outputCostPer1kTokens: 0.00125,
      },
    };

    return pricing[model] || pricing['claude-3-5-sonnet-20241022']!;
  }

  private mapStopReason(reason: string | null): 'stop' | 'length' | 'content_filter' | 'error' {
    switch (reason) {
      case 'end_turn':
      case 'stop_sequence':
        return 'stop';
      case 'max_tokens':
        return 'length';
      default:
        return 'stop';
    }
  }
}
