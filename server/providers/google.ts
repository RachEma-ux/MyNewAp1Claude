// Provider Hub - Google AI Provider Implementation

import { GoogleGenerativeAI } from '@google/generative-ai';
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

export class GoogleProvider extends BaseProvider {
  private client: GoogleGenerativeAI | null = null;

  constructor(config: ProviderConfig) {
    super(config);
  }

  protected async doInitialize(): Promise<void> {
    const apiKey = this.requireConfigValue<string>('apiKey');
    
    this.client = new GoogleGenerativeAI(apiKey);
  }

  protected async doCleanup(): Promise<void> {
    this.client = null;
  }

  protected async doHealthCheck(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const model = this.client.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      await model.generateContent('test');
      return true;
    } catch (error) {
      console.error('[GoogleProvider] Health check failed:', error);
      return false;
    }
  }

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    if (!this.client) {
      throw new Error('Google provider not initialized');
    }

    const startTime = Date.now();
    const modelName = request.model || this.getConfigValue<string>('defaultModel', 'gemini-2.0-flash-exp');

    try {
      const model = this.client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: request.temperature ?? 1.0,
          maxOutputTokens: request.maxTokens,
          topP: request.topP,
          stopSequences: request.stopSequences,
        },
      });

      // Convert messages to Google format
      const systemInstruction = request.messages.find(m => m.role === 'system')?.content;
      const history = request.messages
        .filter(m => m.role !== 'system')
        .slice(0, -1)
        .map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        }));
      
      const lastMessage = request.messages[request.messages.length - 1];
      if (!lastMessage || lastMessage.role === 'system') {
        throw new Error('No user message found');
      }

      const chat = model.startChat({
        history,
        systemInstruction,
      });

      const result = await chat.sendMessage(lastMessage.content);
      const response = result.response;
      const latencyMs = Date.now() - startTime;

      const text = response.text();
      const usage = response.usageMetadata;
      const costProfile = this.getCostPerToken();
      
      const promptTokens = usage?.promptTokenCount || 0;
      const completionTokens = usage?.candidatesTokenCount || 0;
      const cost = (
        (promptTokens / 1000) * costProfile.inputCostPer1kTokens +
        (completionTokens / 1000) * costProfile.outputCostPer1kTokens
      );

      return {
        id: `google-${Date.now()}`,
        content: text,
        model: modelName,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: usage?.totalTokenCount || 0,
        },
        finishReason: this.mapFinishReason(response.candidates?.[0]?.finishReason),
        latencyMs,
        cost,
      };
    } catch (error) {
      console.error('[GoogleProvider] Generation error:', error);
      throw error;
    }
  }

  async *generateStream(request: GenerationRequest): AsyncGenerator<Token, void, unknown> {
    if (!this.client) {
      throw new Error('Google provider not initialized');
    }

    const modelName = request.model || this.getConfigValue<string>('defaultModel', 'gemini-2.0-flash-exp');

    try {
      const model = this.client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: request.temperature ?? 1.0,
          maxOutputTokens: request.maxTokens,
          topP: request.topP,
          stopSequences: request.stopSequences,
        },
      });

      // Convert messages to Google format
      const systemInstruction = request.messages.find(m => m.role === 'system')?.content;
      const history = request.messages
        .filter(m => m.role !== 'system')
        .slice(0, -1)
        .map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        }));
      
      const lastMessage = request.messages[request.messages.length - 1];
      if (!lastMessage || lastMessage.role === 'system') {
        throw new Error('No user message found');
      }

      const chat = model.startChat({
        history,
        systemInstruction,
      });

      const result = await chat.sendMessageStream(lastMessage.content);

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          yield {
            content: text,
            isComplete: false,
          };
        }
      }

      yield {
        content: '',
        isComplete: true,
      };
    } catch (error) {
      console.error('[GoogleProvider] Stream generation error:', error);
      throw error;
    }
  }

  async embed(texts: string[], options?: EmbedOptions): Promise<Embedding[]> {
    if (!this.client) {
      throw new Error('Google provider not initialized');
    }

    const model = options?.model || this.getConfigValue<string>('embeddingModel', 'text-embedding-004');
    const embeddingModel = this.client.getGenerativeModel({ model });

    try {
      const results = await Promise.all(
        texts.map(async (text) => {
          const result = await embeddingModel.embedContent(text);
          return {
            vector: result.embedding.values,
            model,
            dimensions: result.embedding.values.length,
          };
        })
      );

      return results;
    } catch (error) {
      console.error('[GoogleProvider] Embedding error:', error);
      throw error;
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsEmbedding: true,
      supportsFunctionCalling: true,
      supportsVision: true,
      maxContextLength: 1000000, // Gemini 1.5 Pro
      supportedModels: [
        'gemini-2.0-flash-exp',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemini-1.5-flash-8b',
        'text-embedding-004',
      ],
    };
  }

  getCostPerToken(): CostProfile {
    const model = this.getConfigValue<string>('defaultModel', 'gemini-2.0-flash-exp');
    
    // Pricing as of Dec 2024 (per 1M tokens, converted to per 1k)
    const pricing: Record<string, CostProfile> = {
      'gemini-2.0-flash-exp': {
        inputCostPer1kTokens: 0, // Free during preview
        outputCostPer1kTokens: 0,
        embeddingCostPer1kTokens: 0,
      },
      'gemini-1.5-pro': {
        inputCostPer1kTokens: 0.00125, // $1.25 per 1M
        outputCostPer1kTokens: 0.005,   // $5 per 1M
        embeddingCostPer1kTokens: 0,
      },
      'gemini-1.5-flash': {
        inputCostPer1kTokens: 0.000075, // $0.075 per 1M
        outputCostPer1kTokens: 0.0003,   // $0.30 per 1M
        embeddingCostPer1kTokens: 0,
      },
      'gemini-1.5-flash-8b': {
        inputCostPer1kTokens: 0.0000375, // $0.0375 per 1M
        outputCostPer1kTokens: 0.00015,   // $0.15 per 1M
        embeddingCostPer1kTokens: 0,
      },
      'text-embedding-004': {
        inputCostPer1kTokens: 0,
        outputCostPer1kTokens: 0,
        embeddingCostPer1kTokens: 0.00001, // $0.01 per 1M
      },
    };

    return pricing[model] || pricing['gemini-2.0-flash-exp']!;
  }

  private mapFinishReason(reason: string | undefined): 'stop' | 'length' | 'content_filter' | 'error' {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
      case 'RECITATION':
        return 'content_filter';
      case 'OTHER':
      default:
        return 'error';
    }
  }
}
