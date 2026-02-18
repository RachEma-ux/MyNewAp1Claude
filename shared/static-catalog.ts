/**
 * Static catalog entries generated from the PROVIDERS constant.
 * Used as a fallback when the DB is unavailable (e.g., Cloudflare deploy).
 *
 * This is the client-importable equivalent of server/llm/providers.ts PROVIDERS.
 */

export interface StaticCatalogEntry {
  id: number;
  name: string;
  displayName: string;
  entryType: "provider" | "model";
  category: string;
  subCategory: string | null;
  capabilities: string[];
  scope: string;
  status: string;
  origin: string;
  config: Record<string, any>;
  tags: string[];
  reviewState: string;
}

interface ProviderDef {
  id: string;
  name: string;
  type: "cloud" | "local" | "custom";
  models: { id: string; name: string; contextLength?: number }[];
}

const PROVIDERS_RAW: ProviderDef[] = [
  { id: "anthropic", name: "Anthropic", type: "cloud", models: [
    { id: "claude-opus-4-6", name: "Claude Opus 4.6", contextLength: 200000 },
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", contextLength: 200000 },
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", contextLength: 200000 },
    { id: "claude-opus-4-5", name: "Claude Opus 4.5", contextLength: 200000 },
    { id: "claude-sonnet-4", name: "Claude Sonnet 4", contextLength: 200000 },
  ]},
  { id: "openai", name: "OpenAI", type: "cloud", models: [
    { id: "gpt-4.1", name: "GPT-4.1", contextLength: 1000000 },
    { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", contextLength: 1000000 },
    { id: "gpt-4.1-nano", name: "GPT-4.1 Nano", contextLength: 1000000 },
    { id: "o3", name: "o3", contextLength: 200000 },
    { id: "o4-mini", name: "o4 Mini", contextLength: 200000 },
    { id: "gpt-4o", name: "GPT-4o", contextLength: 128000 },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", contextLength: 128000 },
  ]},
  { id: "google", name: "Google", type: "cloud", models: [
    { id: "gemini-3-pro", name: "Gemini 3 Pro", contextLength: 1000000 },
    { id: "gemini-3-flash", name: "Gemini 3 Flash", contextLength: 1000000 },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", contextLength: 1000000 },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", contextLength: 1000000 },
    { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", contextLength: 1000000 },
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", contextLength: 1000000 },
  ]},
  { id: "meta", name: "Meta", type: "cloud", models: [
    { id: "llama-4-scout", name: "Llama 4 Scout", contextLength: 1000000 },
    { id: "llama-4-maverick", name: "Llama 4 Maverick", contextLength: 1000000 },
    { id: "llama-3.3-70b", name: "Llama 3.3 70B", contextLength: 128000 },
    { id: "llama-3.2-3b", name: "Llama 3.2 3B", contextLength: 128000 },
  ]},
  { id: "mistral", name: "Mistral AI", type: "cloud", models: [
    { id: "mistral-large", name: "Mistral Large", contextLength: 128000 },
    { id: "mistral-small", name: "Mistral Small", contextLength: 128000 },
    { id: "codestral", name: "Codestral", contextLength: 256000 },
    { id: "mistral-nemo", name: "Mistral Nemo", contextLength: 128000 },
  ]},
  { id: "microsoft", name: "Microsoft", type: "cloud", models: [
    { id: "phi-4", name: "Phi-4", contextLength: 16384 },
    { id: "phi-4-mini", name: "Phi-4 Mini", contextLength: 128000 },
    { id: "phi-4-multimodal", name: "Phi-4 Multimodal", contextLength: 128000 },
  ]},
  { id: "qwen", name: "Qwen", type: "cloud", models: [
    { id: "qwen3-235b", name: "Qwen 3 235B", contextLength: 131072 },
    { id: "qwen3-32b", name: "Qwen 3 32B", contextLength: 131072 },
    { id: "qwen3-8b", name: "Qwen 3 8B", contextLength: 131072 },
    { id: "qwen2.5-coder", name: "Qwen 2.5 Coder", contextLength: 131072 },
  ]},
  { id: "xai", name: "xAI", type: "cloud", models: [
    { id: "grok", name: "Grok" },
    { id: "grok-1.5", name: "Grok-1.5" },
  ]},
  { id: "cohere", name: "Cohere", type: "cloud", models: [
    { id: "command", name: "Command" },
    { id: "command-r", name: "Command-R" },
    { id: "command-r-plus", name: "Command-R+" },
  ]},
  { id: "deepseek", name: "DeepSeek", type: "cloud", models: [
    { id: "deepseek-r1", name: "DeepSeek R1" },
    { id: "deepseek-v3", name: "DeepSeek V3" },
    { id: "deepseek-chat", name: "DeepSeek Chat" },
  ]},
  { id: "perplexity", name: "Perplexity", type: "cloud", models: [
    { id: "perplexity-pro", name: "Perplexity Pro" },
    { id: "perplexity-standard", name: "Perplexity Standard" },
  ]},
  { id: "ollama", name: "Ollama", type: "local", models: [] },
  { id: "llamacpp", name: "llama.cpp", type: "local", models: [] },
];

let _cache: StaticCatalogEntry[] | null = null;

/** Build catalog-shaped entries from static provider data */
export function getStaticCatalogEntries(): StaticCatalogEntry[] {
  if (_cache) return _cache;

  const entries: StaticCatalogEntry[] = [];
  let syntheticId = -1; // Negative IDs to avoid collisions with real DB entries

  for (const p of PROVIDERS_RAW) {
    const category = p.type === "local" ? "local_runtime" : "cloud_api";

    // Provider entry
    entries.push({
      id: syntheticId--,
      name: p.id,
      displayName: p.name,
      entryType: "provider",
      category,
      subCategory: null,
      capabilities: [],
      scope: "global",
      status: "active",
      origin: "static",
      config: { providerId: p.id },
      tags: [p.id],
      reviewState: "approved",
    });

    // Model entries
    for (const m of p.models) {
      entries.push({
        id: syntheticId--,
        name: m.id,
        displayName: m.name,
        entryType: "model",
        category: "base_llm",
        subCategory: null,
        capabilities: [],
        scope: "global",
        status: "active",
        origin: "static",
        config: { providerId: p.id, contextLength: m.contextLength },
        tags: [p.id],
        reviewState: "approved",
      });
    }
  }

  _cache = entries;
  return entries;
}
