/**
 * LLM Provider Definitions from MultiChat
 * 14 providers with their models and configurations
 */

export interface ProviderModel {
  id: string;
  name: string;
  contextLength?: number;
  strengths?: string[];
}

export interface Provider {
  id: string;
  name: string;
  company: string;
  color: string;
  strengths: string[];
  models: ProviderModel[];
  requiresApiKey: boolean;
  baseUrl?: string;
}

export const PROVIDERS: Record<string, Provider> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    company: 'Anthropic',
    color: 'bg-orange-500',
    strengths: ['reasoning', 'ethics', 'long-form'],
    requiresApiKey: true,
    models: [
      { id: 'claude-3-haiku', name: 'Claude 3 Haiku', contextLength: 200000 },
      { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', contextLength: 200000 },
      { id: 'claude-3-opus', name: 'Claude 3 Opus', contextLength: 200000 },
      { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', contextLength: 200000 },
    ],
  },

  openai: {
    id: 'openai',
    name: 'OpenAI',
    company: 'OpenAI',
    color: 'bg-green-500',
    strengths: ['creative', 'code', 'general'],
    requiresApiKey: true,
    models: [
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', contextLength: 16385 },
      { id: 'gpt-4', name: 'GPT-4', contextLength: 8192 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextLength: 128000 },
      { id: 'gpt-4o', name: 'GPT-4o', contextLength: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextLength: 128000 },
    ],
  },

  google: {
    id: 'google',
    name: 'Google',
    company: 'Google',
    color: 'bg-blue-500',
    strengths: ['multimodal', 'search', 'analysis'],
    requiresApiKey: true,
    models: [
      { id: 'gemini-nano', name: 'Gemini Nano' },
      { id: 'gemini-pro', name: 'Gemini Pro', contextLength: 32768 },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextLength: 1000000 },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', contextLength: 1000000 },
      { id: 'gemini-ultra', name: 'Gemini Ultra' },
      { id: 'gemma', name: 'Gemma' },
      { id: 'palm-2', name: 'PaLM 2' },
    ],
  },

  meta: {
    id: 'meta',
    name: 'Meta',
    company: 'Meta',
    color: 'bg-blue-600',
    strengths: ['open-source', 'coding', 'general'],
    requiresApiKey: false,
    models: [
      { id: 'llama-2-7b', name: 'Llama 2 7B', contextLength: 4096 },
      { id: 'llama-2-13b', name: 'Llama 2 13B', contextLength: 4096 },
      { id: 'llama-2-70b', name: 'Llama 2 70B', contextLength: 4096 },
      { id: 'llama-3-8b', name: 'Llama 3 8B', contextLength: 8192 },
      { id: 'llama-3-70b', name: 'Llama 3 70B', contextLength: 8192 },
      { id: 'code-llama', name: 'Code Llama', contextLength: 16384 },
      { id: 'llama-guard', name: 'Llama Guard' },
    ],
  },

  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    company: 'Mistral AI',
    color: 'bg-orange-600',
    strengths: ['efficient', 'coding', 'multilingual'],
    requiresApiKey: true,
    models: [
      { id: 'mistral-7b', name: 'Mistral 7B', contextLength: 8192 },
      { id: 'mixtral-8x7b', name: 'Mixtral 8x7B', contextLength: 32768 },
      { id: 'mixtral-8x22b', name: 'Mixtral 8x22B', contextLength: 65536 },
      { id: 'codestral', name: 'Codestral', contextLength: 32768 },
    ],
  },

  microsoft: {
    id: 'microsoft',
    name: 'Microsoft',
    company: 'Microsoft',
    color: 'bg-blue-400',
    strengths: ['efficient', 'reasoning', 'coding'],
    requiresApiKey: true,
    models: [
      { id: 'phi-2', name: 'Phi-2', contextLength: 2048 },
      { id: 'phi-3-mini', name: 'Phi-3 Mini', contextLength: 4096 },
      { id: 'phi-3-small', name: 'Phi-3 Small', contextLength: 8192 },
      { id: 'phi-3-medium', name: 'Phi-3 Medium', contextLength: 8192 },
    ],
  },

  qwen: {
    id: 'qwen',
    name: 'Qwen',
    company: 'Alibaba / Qwen',
    color: 'bg-red-500',
    strengths: ['multilingual', 'coding', 'general'],
    requiresApiKey: false,
    models: [
      { id: 'qwen-1.8b', name: 'Qwen 1.8B', contextLength: 8192 },
      { id: 'qwen-7b', name: 'Qwen 7B', contextLength: 8192 },
      { id: 'qwen-14b', name: 'Qwen 14B', contextLength: 8192 },
      { id: 'qwen-72b', name: 'Qwen 72B', contextLength: 32768 },
      { id: 'qwen1.5', name: 'Qwen1.5', contextLength: 32768 },
      { id: 'qwen2', name: 'Qwen2', contextLength: 32768 },
      { id: 'code-qwen', name: 'Code Qwen', contextLength: 65536 },
    ],
  },

  xai: {
    id: 'xai',
    name: 'xAI',
    company: 'xAI',
    color: 'bg-yellow-500',
    strengths: ['reasoning', 'general', 'real-time'],
    requiresApiKey: true,
    models: [
      { id: 'grok', name: 'Grok' },
      { id: 'grok-1.5', name: 'Grok-1.5' },
    ],
  },

  cohere: {
    id: 'cohere',
    name: 'Cohere',
    company: 'Cohere',
    color: 'bg-teal-500',
    strengths: ['enterprise', 'embeddings', 'reranking'],
    requiresApiKey: true,
    models: [
      { id: 'command', name: 'Command' },
      { id: 'command-r', name: 'Command-R' },
      { id: 'command-r-plus', name: 'Command-R+' },
      { id: 'embed', name: 'Embed' },
      { id: 'rerank', name: 'Rerank' },
    ],
  },

  butterfly: {
    id: 'butterfly',
    name: 'Butterfly',
    company: 'Butterfly Effect Technology',
    color: 'bg-pink-500',
    strengths: ['general', 'creative'],
    requiresApiKey: true,
    models: [
      { id: 'manus', name: 'Manus' },
    ],
  },

  moonshot: {
    id: 'moonshot',
    name: 'Moonshot',
    company: 'Moonshot AI',
    color: 'bg-cyan-500',
    strengths: ['conversation', 'general'],
    requiresApiKey: true,
    models: [
      { id: 'kimi', name: 'Kimi' },
    ],
  },

  palantir: {
    id: 'palantir',
    name: 'Palantir',
    company: 'Palantir',
    color: 'bg-slate-700',
    strengths: ['data-integration', 'analytics', 'enterprise'],
    requiresApiKey: true,
    models: [
      { id: 'palantir-api', name: 'API' },
      { id: 'gotham', name: 'Gotham' },
      { id: 'foundry', name: 'Foundry' },
      { id: 'apollo', name: 'Apollo' },
    ],
  },

  perplexity: {
    id: 'perplexity',
    name: 'Perplexity',
    company: 'Perplexity',
    color: 'bg-indigo-500',
    strengths: ['research', 'citations', 'facts'],
    requiresApiKey: true,
    models: [
      { id: 'perplexity-pro', name: 'Perplexity Pro' },
      { id: 'perplexity-standard', name: 'Perplexity Standard' },
    ],
  },

  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    company: 'DeepSeek',
    color: 'bg-purple-500',
    strengths: ['technical', 'coding', 'math'],
    requiresApiKey: true,
    models: [
      { id: 'deepseek-v3', name: 'DeepSeek V3' },
      { id: 'deepseek-coder', name: 'DeepSeek Coder' },
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
    ],
  },
};

/**
 * Preset configurations combining multiple providers
 */
export interface ProviderPreset {
  id: string;
  name: string;
  description: string;
  providers: Array<{
    providerId: string;
    modelId: string;
  }>;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'coding',
    name: 'Coding Team',
    description: 'Code generation, debugging, technical problem-solving',
    providers: [
      { providerId: 'openai', modelId: 'gpt-4' },
      { providerId: 'deepseek', modelId: 'deepseek-coder' },
      { providerId: 'mistral', modelId: 'codestral' },
    ],
  },
  {
    id: 'creative',
    name: 'Creative Writers',
    description: 'Storytelling, copywriting, creative content',
    providers: [
      { providerId: 'openai', modelId: 'gpt-4-turbo' },
      { providerId: 'anthropic', modelId: 'claude-3-opus' },
      { providerId: 'butterfly', modelId: 'manus' },
    ],
  },
  {
    id: 'research',
    name: 'Research Squad',
    description: 'Fact-finding, citations, in-depth analysis',
    providers: [
      { providerId: 'perplexity', modelId: 'perplexity-pro' },
      { providerId: 'google', modelId: 'gemini-pro' },
      { providerId: 'anthropic', modelId: 'claude-3-sonnet' },
    ],
  },
  {
    id: 'general',
    name: 'General Purpose',
    description: 'Versatile team for everyday tasks',
    providers: [
      { providerId: 'openai', modelId: 'gpt-4' },
      { providerId: 'anthropic', modelId: 'claude-3-sonnet' },
      { providerId: 'google', modelId: 'gemini-pro' },
    ],
  },
  {
    id: 'fast',
    name: 'Fast Responders',
    description: 'Quick responses for simple queries',
    providers: [
      { providerId: 'openai', modelId: 'gpt-3.5-turbo' },
      { providerId: 'anthropic', modelId: 'claude-3-haiku' },
      { providerId: 'google', modelId: 'gemini-nano' },
    ],
  },
];

/**
 * Get all providers as an array
 */
export function getAllProviders(): Provider[] {
  return Object.values(PROVIDERS);
}

/**
 * Get a specific provider by ID
 */
export function getProvider(id: string): Provider | undefined {
  return PROVIDERS[id];
}

/**
 * Get all models for a specific provider
 */
export function getProviderModels(providerId: string): ProviderModel[] {
  const provider = PROVIDERS[providerId];
  return provider ? provider.models : [];
}

/**
 * Get a specific model from a provider
 */
export function getProviderModel(providerId: string, modelId: string): ProviderModel | undefined {
  const provider = PROVIDERS[providerId];
  return provider?.models.find(m => m.id === modelId);
}

/**
 * Get all presets
 */
export function getAllPresets(): ProviderPreset[] {
  return PROVIDER_PRESETS;
}

/**
 * Get a specific preset by ID
 */
export function getPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find(p => p.id === id);
}
