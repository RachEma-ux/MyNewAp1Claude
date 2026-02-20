/**
 * Shared Provider Registry — Single source of truth for well-known LLM providers.
 *
 * Used by:
 *   - Discovery service (registry fast-path + probe config)
 *   - ConnectProviderModal (slug-based URL/auth lookup)
 *   - Provider connection service (health probes)
 */

export interface KnownProvider {
  slug: string;
  name: string;
  domains: string[];
  apiUrl: string | null;
  description: string;
  compatibility: "openai" | "anthropic" | "custom";
  authType: "api_key" | "pat" | "oauth" | "none";
  isLocal: boolean;
  defaultLocalUrl?: string;
  modelsListProbe: {
    method: "GET" | "HEAD";
    path: string;
    headers?: Record<string, string>;
  };
  healthProbe?: {
    method: "GET" | "HEAD";
    path: string;
    headers?: Record<string, string>;
  };
}

export const KNOWN_PROVIDERS: KnownProvider[] = [
  // ── Cloud providers ──────────────────────────────────────────────────
  {
    slug: "openai",
    name: "OpenAI",
    domains: ["openai.com", "platform.openai.com"],
    apiUrl: "https://api.openai.com",
    description: "GPT-4, GPT-3.5, DALL-E, Whisper, and embeddings",
    compatibility: "openai",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/v1/models" },
  },
  {
    slug: "anthropic",
    name: "Anthropic",
    domains: ["anthropic.com", "console.anthropic.com"],
    apiUrl: "https://api.anthropic.com",
    description: "Claude family of models",
    compatibility: "anthropic",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: {
      method: "GET",
      path: "/v1/models",
      headers: { "anthropic-version": "2023-06-01" },
    },
  },
  {
    slug: "google",
    name: "Google AI",
    domains: ["ai.google.dev", "generativelanguage.googleapis.com", "aistudio.google.com", "google.com"],
    apiUrl: "https://generativelanguage.googleapis.com",
    description: "Gemini family of models",
    compatibility: "custom",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/v1beta/models" },
  },
  {
    slug: "mistral",
    name: "Mistral AI",
    domains: ["mistral.ai", "console.mistral.ai"],
    apiUrl: "https://api.mistral.ai",
    description: "Mistral, Mixtral, and Codestral models",
    compatibility: "openai",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/v1/models" },
  },
  {
    slug: "meta",
    name: "Meta AI",
    domains: ["llama.com", "llama.meta.com", "ai.meta.com"],
    apiUrl: "https://api.llama.com",
    description: "Llama family of models",
    compatibility: "openai",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/v1/models" },
  },
  {
    slug: "xai",
    name: "xAI",
    domains: ["x.ai", "console.x.ai"],
    apiUrl: "https://api.x.ai",
    description: "Grok family of models",
    compatibility: "openai",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/v1/models" },
  },
  {
    slug: "cohere",
    name: "Cohere",
    domains: ["cohere.com", "dashboard.cohere.com"],
    apiUrl: "https://api.cohere.com",
    description: "Command, Embed, and Rerank models",
    compatibility: "custom",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/v1/models" },
  },
  {
    slug: "deepseek",
    name: "DeepSeek",
    domains: ["deepseek.com", "platform.deepseek.com"],
    apiUrl: "https://api.deepseek.com",
    description: "DeepSeek-V3 and DeepSeek-R1 models",
    compatibility: "openai",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/v1/models" },
  },
  {
    slug: "perplexity",
    name: "Perplexity",
    domains: ["perplexity.ai"],
    apiUrl: "https://api.perplexity.ai",
    description: "Sonar online models with real-time search",
    compatibility: "openai",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/v1/models" },
  },
  {
    slug: "groq",
    name: "Groq",
    domains: ["groq.com", "console.groq.com"],
    apiUrl: "https://api.groq.com/openai",
    description: "Ultra-fast inference with LPU hardware",
    compatibility: "openai",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/v1/models" },
  },
  {
    slug: "fireworks",
    name: "Fireworks AI",
    domains: ["fireworks.ai"],
    apiUrl: "https://api.fireworks.ai/inference",
    description: "Fast open-source model inference",
    compatibility: "openai",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/v1/models" },
  },
  {
    slug: "together",
    name: "Together AI",
    domains: ["together.ai", "api.together.xyz"],
    apiUrl: "https://api.together.xyz",
    description: "Open-source model hosting and fine-tuning",
    compatibility: "openai",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/v1/models" },
  },
  {
    slug: "openrouter",
    name: "OpenRouter",
    domains: ["openrouter.ai"],
    apiUrl: "https://openrouter.ai/api",
    description: "Unified API for 100+ models from multiple providers",
    compatibility: "openai",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/v1/models" },
  },
  {
    slug: "azure-openai",
    name: "Azure OpenAI",
    domains: ["azure.com", "oai.azure.com", "cognitiveservices.azure.com"],
    apiUrl: null, // Deployment-specific URL
    description: "OpenAI models via Azure",
    compatibility: "openai",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/openai/models?api-version=2024-02-01" },
  },
  {
    slug: "microsoft",
    name: "Microsoft AI",
    domains: ["models.inference.ai.azure.com"],
    apiUrl: "https://models.inference.ai.azure.com",
    description: "GitHub Models and Azure AI inference",
    compatibility: "openai",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/v1/models" },
  },
  {
    slug: "qwen",
    name: "Qwen (Alibaba)",
    domains: ["dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com"],
    apiUrl: "https://dashscope-intl.aliyuncs.com",
    description: "Qwen family of models",
    compatibility: "openai",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/v1/models" },
  },

  // ── Additional cloud providers ─────────────────────────────────────
  {
    slug: "stability",
    name: "Stability AI",
    domains: ["stability.ai", "platform.stability.ai"],
    apiUrl: "https://api.stability.ai",
    description: "Stable Diffusion image generation models",
    compatibility: "custom",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/v1/engines/list" },
  },
  {
    slug: "deepai",
    name: "DeepAI",
    domains: ["deepai.org"],
    apiUrl: "https://api.deepai.org",
    description: "Image generation and AI utilities",
    compatibility: "custom",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/api/text2img" },
  },
  {
    slug: "nlpcloud",
    name: "NLP Cloud",
    domains: ["nlpcloud.com", "nlpcloud.io"],
    apiUrl: "https://api.nlpcloud.io",
    description: "Text generation, code, and NLP models",
    compatibility: "custom",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/v1/models" },
  },
  {
    slug: "replicate",
    name: "Replicate",
    domains: ["replicate.com"],
    apiUrl: "https://api.replicate.com",
    description: "Run open-source models in the cloud",
    compatibility: "custom",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/v1/models" },
  },
  {
    slug: "aws-bedrock",
    name: "AWS Bedrock",
    domains: ["aws.amazon.com"],
    apiUrl: null, // Region-specific: bedrock-runtime.<region>.amazonaws.com
    description: "Amazon Titan and multi-provider models via AWS",
    compatibility: "custom",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/foundation-models" },
  },
  {
    slug: "edenai",
    name: "Eden AI",
    domains: ["edenai.co", "edenai.run"],
    apiUrl: "https://api.edenai.run",
    description: "Unified API aggregating 100+ AI providers",
    compatibility: "custom",
    authType: "api_key",
    isLocal: false,
    modelsListProbe: { method: "GET", path: "/v2/info" },
  },

  // ── Local providers ──────────────────────────────────────────────────
  {
    slug: "ollama",
    name: "Ollama",
    domains: ["ollama.com", "ollama.ai"],
    apiUrl: null,
    description: "Run open-source LLMs locally",
    compatibility: "custom",
    authType: "none",
    isLocal: true,
    defaultLocalUrl: "http://localhost:11434",
    modelsListProbe: { method: "GET", path: "/api/tags" },
    healthProbe: { method: "GET", path: "/" },
  },
  {
    slug: "llamacpp",
    name: "llama.cpp",
    domains: ["github.com/ggerganov/llama.cpp"],
    apiUrl: null,
    description: "Local GGUF model inference server",
    compatibility: "openai",
    authType: "none",
    isLocal: true,
    defaultLocalUrl: "http://localhost:8080",
    modelsListProbe: { method: "GET", path: "/v1/models" },
    healthProbe: { method: "GET", path: "/health" },
  },
];

// ── Lookup functions (memoized) ──────────────────────────────────────

/**
 * Normalize a domain for matching: lowercase, strip www., strip trailing dots.
 */
function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

// Pre-built lookup maps (computed once at module load)
const _domainMap = new Map<string, KnownProvider>();
const _slugMap = new Map<string, KnownProvider>();
for (const p of KNOWN_PROVIDERS) {
  _slugMap.set(p.slug, p);
  for (const d of p.domains) {
    _domainMap.set(normalizeDomain(d), p);
  }
}

/**
 * Find a known provider by website domain.
 * Supports exact match and subdomain match (e.g. "console.anthropic.com" matches "anthropic.com").
 * Uses pre-built Map for O(1) exact lookups.
 */
export function findKnownProvider(domain: string): KnownProvider | undefined {
  const needle = normalizeDomain(domain);

  // O(1) exact match
  const exact = _domainMap.get(needle);
  if (exact) return exact;

  // Subdomain match (needle ends with ".knownDomain")
  let subdomainMatch: KnownProvider | undefined;
  _domainMap.forEach((provider, knownDomain) => {
    if (!subdomainMatch && needle.endsWith("." + knownDomain)) subdomainMatch = provider;
  });
  if (subdomainMatch) return subdomainMatch;

  return undefined;
}

/**
 * Find a known provider by slug. O(1) via pre-built Map.
 */
export function findProviderBySlug(slug: string): KnownProvider | undefined {
  return _slugMap.get(slug);
}

/**
 * Build a slug-to-apiUrl map for non-local providers.
 */
export function getProviderApiUrls(): Record<string, string> {
  return Object.fromEntries(
    KNOWN_PROVIDERS.filter((p) => p.apiUrl !== null).map((p) => [p.slug, p.apiUrl!])
  );
}
