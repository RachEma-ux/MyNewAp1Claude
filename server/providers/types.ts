// Provider Hub - Core Types and Interfaces

export type ProviderType = 
  | 'local-llamacpp'
  | 'local-ollama'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'custom';

export type ProviderStatus = 'active' | 'inactive' | 'error' | 'initializing';

export interface GenerationRequest {
  messages: Message[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  stream?: boolean;
  workspaceId?: number;
  userId?: number;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerationResponse {
  id: string;
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
  latencyMs: number;
  cost?: number;
}

export interface Token {
  content: string;
  isComplete: boolean;
}

export interface EmbedOptions {
  model?: string;
  dimensions?: number;
}

export interface Embedding {
  vector: number[];
  model: string;
  dimensions: number;
}

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsEmbedding: boolean;
  supportsFunctionCalling: boolean;
  supportsVision: boolean;
  maxContextLength: number;
  supportedModels: string[];
}

export interface CostProfile {
  inputCostPer1kTokens: number;
  outputCostPer1kTokens: number;
  embeddingCostPer1kTokens?: number;
}

export interface LatencyProfile {
  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  tokensPerSecond: number;
}

export interface HealthStatus {
  healthy: boolean;
  message?: string;
  lastChecked: Date;
  details?: Record<string, unknown>;
}

export interface ProviderConfig {
  id: number;
  name: string;
  type: ProviderType;
  enabled: boolean;
  priority: number;
  config: Record<string, unknown>;
  costPer1kTokens?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceProviderAssignment {
  id: number;
  workspaceId: number;
  providerId: number;
  enabled: boolean;
  priority: number;
  quotaTokensPerDay?: number;
}

export interface ProviderUsage {
  id: number;
  workspaceId: number;
  providerId: number;
  modelName?: string;
  tokensUsed: number;
  cost?: number;
  latencyMs?: number;
  createdAt: Date;
}

export interface ProviderMetrics {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageLatency: number;
  errorRate: number;
  lastUsed: Date;
}
