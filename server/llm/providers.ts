/**
 * LLM Provider Definitions with In-App Installation Support
 * 14+ providers with models, configurations, and installation flows
 */

export type ProviderType = 'cloud' | 'local' | 'custom';

export interface SystemRequirements {
  minRAM: number; // GB
  recommendedRAM: number; // GB
  minDiskSpace: number; // GB
  gpuRequired: boolean;
  minVRAM?: number; // GB (if GPU required)
  supportedOS?: string[]; // ['windows', 'macos', 'linux', 'android']
  supportedArchitectures?: string[]; // ['x64', 'arm64']
}


export interface ProviderModel {
  id: string;
  name: string;
  contextLength?: number;
  strengths?: string[];
  size?: string; // For local models (e.g., "3.8GB")
  recommended?: boolean;
  systemRequirements?: SystemRequirements; // For local models
}

export interface InstallationMetadata {
  required: boolean; // Does this provider need installation?
  detectionEndpoint: string; // URL to check if installed (e.g., "http://localhost:11434/api/tags")
  downloadUrls: {
    windows?: string;
    macos?: string;
    linux?: string;
    android?: string;
    dockerImage?: string;
  };
  instructions: string[];
  defaultPort?: number;
}

export interface ModelManagement {
  enabled: boolean; // Can user download/manage models?
  listEndpoint?: string; // Endpoint to list available models
  downloadCommand?: (modelId: string) => string; // Command to download model
  removeCommand?: (modelId: string) => string; // Command to remove model
  libraryUrl?: string; // URL to model library/marketplace
}

export interface Provider {
  id: string;
  name: string;
  company: string;
  type: ProviderType; // cloud, local, or custom
  color: string;
  strengths: string[];
  models: ProviderModel[];
  requiresApiKey: boolean;
  baseUrl?: string;

  // Installation support (for local providers)
  installation?: InstallationMetadata;

  // Model management (for providers with downloadable models)
  modelManagement?: ModelManagement;
}

export const PROVIDERS: Record<string, Provider> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    company: 'Anthropic',
    type: 'cloud',
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
    type: 'cloud',
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
    type: 'cloud',
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
    type: 'cloud',
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
    type: 'cloud',
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
    type: 'cloud',
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
    type: 'cloud',
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
    type: 'cloud',
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
    type: 'cloud',
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
    type: 'cloud',
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
    type: 'cloud',
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
    type: 'cloud',
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
    type: 'cloud',
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
    type: 'cloud',
    color: 'bg-purple-500',
    strengths: ['technical', 'coding', 'math'],
    requiresApiKey: true,
    models: [
      { id: 'deepseek-v3', name: 'DeepSeek V3' },
      { id: 'deepseek-coder', name: 'DeepSeek Coder' },
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
    ],
  },

  // LOCAL PROVIDERS - Run on user's machine

  ollama: {
    id: 'ollama',
    name: 'Ollama',
    company: 'Ollama',
    type: 'local',
    color: 'bg-slate-600',
    strengths: ['local', 'privacy', 'offline', 'free'],
    requiresApiKey: false,
    baseUrl: 'http://localhost:11434',

    // Installation support
    installation: {
      required: true,
      detectionEndpoint: 'http://localhost:11434/api/tags',
      downloadUrls: {
        windows: 'https://ollama.ai/download/windows',
        macos: 'https://ollama.ai/download/mac',
        linux: 'https://ollama.ai/download/linux',
        android: 'https://ollama.ai/download/android',
        dockerImage: 'docker pull ollama/ollama',
      },
      instructions: [
        'Download Ollama installer for your OS',
        'Run the installer',
        'Ollama will start automatically',
        'Click "Check Installation" to verify',
        'Download models from the Model Library',
      ],
      defaultPort: 11434,
    },

    // Model management support
    modelManagement: {
      enabled: true,
      listEndpoint: 'http://localhost:11434/api/tags',
      downloadCommand: (modelId: string) => `ollama pull ${modelId}`,
      removeCommand: (modelId: string) => `ollama rm ${modelId}`,
      libraryUrl: 'https://ollama.ai/library',
    },

    // Popular Ollama models with system requirements
    models: [
      {
        id: 'llama2',
        name: 'Llama 2',
        size: '3.8GB',
        contextLength: 4096,
        recommended: true,
        systemRequirements: {
          minRAM: 8,
          recommendedRAM: 16,
          minDiskSpace: 5,
          gpuRequired: false,
          supportedOS: ['windows', 'macos', 'linux', 'android'],
          supportedArchitectures: ['x64', 'arm64'],
        },
      },
      {
        id: 'llama2:13b',
        name: 'Llama 2 13B',
        size: '7.3GB',
        contextLength: 4096,
        recommended: false,
        systemRequirements: {
          minRAM: 16,
          recommendedRAM: 32,
          minDiskSpace: 10,
          gpuRequired: false,
          minVRAM: 8,
          supportedOS: ['windows', 'macos', 'linux', 'android'],
          supportedArchitectures: ['x64', 'arm64'],
        },
      },
      {
        id: 'llama2:70b',
        name: 'Llama 2 70B',
        size: '39GB',
        contextLength: 4096,
        recommended: false,
        systemRequirements: {
          minRAM: 64,
          recommendedRAM: 128,
          minDiskSpace: 50,
          gpuRequired: true,
          minVRAM: 40,
          supportedOS: ['windows', 'macos', 'linux', 'android'],
          supportedArchitectures: ['x64'],
        },
      },
      {
        id: 'mistral',
        name: 'Mistral',
        size: '4.1GB',
        contextLength: 8192,
        recommended: true,
        systemRequirements: {
          minRAM: 8,
          recommendedRAM: 16,
          minDiskSpace: 6,
          gpuRequired: false,
          supportedOS: ['windows', 'macos', 'linux', 'android'],
          supportedArchitectures: ['x64', 'arm64'],
        },
      },
      {
        id: 'mixtral',
        name: 'Mixtral 8x7B',
        size: '26GB',
        contextLength: 32768,
        recommended: false,
        systemRequirements: {
          minRAM: 32,
          recommendedRAM: 64,
          minDiskSpace: 35,
          gpuRequired: true,
          minVRAM: 24,
          supportedOS: ['windows', 'macos', 'linux', 'android'],
          supportedArchitectures: ['x64'],
        },
      },
      {
        id: 'codellama',
        name: 'Code Llama',
        size: '3.8GB',
        contextLength: 16384,
        recommended: true,
        systemRequirements: {
          minRAM: 8,
          recommendedRAM: 16,
          minDiskSpace: 5,
          gpuRequired: false,
          supportedOS: ['windows', 'macos', 'linux', 'android'],
          supportedArchitectures: ['x64', 'arm64'],
        },
      },
      {
        id: 'codellama:34b',
        name: 'Code Llama 34B',
        size: '19GB',
        contextLength: 16384,
        recommended: false,
        systemRequirements: {
          minRAM: 32,
          recommendedRAM: 48,
          minDiskSpace: 25,
          gpuRequired: true,
          minVRAM: 20,
          supportedOS: ['windows', 'macos', 'linux', 'android'],
          supportedArchitectures: ['x64'],
        },
      },
      {
        id: 'phi',
        name: 'Phi',
        size: '1.6GB',
        contextLength: 2048,
        recommended: true,
        systemRequirements: {
          minRAM: 4,
          recommendedRAM: 8,
          minDiskSpace: 3,
          gpuRequired: false,
          supportedOS: ['windows', 'macos', 'linux', 'android'],
          supportedArchitectures: ['x64', 'arm64'],
        },
      },
      {
        id: 'neural-chat',
        name: 'Neural Chat',
        size: '4.1GB',
        contextLength: 8192,
        recommended: false,
        systemRequirements: {
          minRAM: 8,
          recommendedRAM: 16,
          minDiskSpace: 6,
          gpuRequired: false,
          supportedOS: ['windows', 'macos', 'linux', 'android'],
          supportedArchitectures: ['x64', 'arm64'],
        },
      },
      {
        id: 'starling-lm',
        name: 'Starling',
        size: '4.1GB',
        contextLength: 8192,
        recommended: false,
        systemRequirements: {
          minRAM: 8,
          recommendedRAM: 16,
          minDiskSpace: 6,
          gpuRequired: false,
          supportedOS: ['windows', 'macos', 'linux', 'android'],
          supportedArchitectures: ['x64', 'arm64'],
        },
      },
      {
        id: 'orca-mini',
        name: 'Orca Mini',
        size: '1.9GB',
        contextLength: 4096,
        recommended: true,
        systemRequirements: {
          minRAM: 4,
          recommendedRAM: 8,
          minDiskSpace: 3,
          gpuRequired: false,
          supportedOS: ['windows', 'macos', 'linux', 'android'],
          supportedArchitectures: ['x64', 'arm64'],
        },
      },
      {
        id: 'vicuna',
        name: 'Vicuna',
        size: '3.8GB',
        contextLength: 2048,
        recommended: false,
        systemRequirements: {
          minRAM: 8,
          recommendedRAM: 16,
          minDiskSpace: 5,
          gpuRequired: false,
          supportedOS: ['windows', 'macos', 'linux', 'android'],
          supportedArchitectures: ['x64', 'arm64'],
        },
      },
      {
        id: 'llama2-uncensored',
        name: 'Llama 2 Uncensored',
        size: '3.8GB',
        contextLength: 4096,
        recommended: false,
        systemRequirements: {
          minRAM: 8,
          recommendedRAM: 16,
          minDiskSpace: 5,
          gpuRequired: false,
          supportedOS: ['windows', 'macos', 'linux', 'android'],
          supportedArchitectures: ['x64', 'arm64'],
        },
      },
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
