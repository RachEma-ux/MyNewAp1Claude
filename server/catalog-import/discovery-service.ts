/**
 * API Discovery Service — Fetches models from provider APIs and normalizes to PreviewEntry format
 */
import { randomUUID } from "crypto";
import type { PreviewEntry } from "@shared/catalog-import-types";

// ============================================================================
// Domain Allowlist
// ============================================================================

const DEFAULT_ALLOWED_DOMAINS = [
  "openai.com",
  "anthropic.com",
  "googleapis.com",
  "generativelanguage.googleapis.com",
  "mistral.ai",
  "cohere.com",
  "together.xyz",
  "groq.com",
  "perplexity.ai",
  "deepseek.com",
  "x.ai",
  "llama.com",
  "aliyuncs.com",
  "inference.ai.azure.com",
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
];

function getAllowedDomains(): string[] {
  const envDomains = process.env.IMPORT_ALLOWED_DOMAINS;
  if (envDomains) {
    return envDomains.split(",").map((d) => d.trim()).filter(Boolean);
  }
  return DEFAULT_ALLOWED_DOMAINS;
}

function isDomainAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    return getAllowedDomains().some(
      (d) => hostname === d || hostname.endsWith(`.${d}`)
    );
  } catch {
    return false;
  }
}

// ============================================================================
// Provider-Specific Fetchers
// ============================================================================

interface RawModel {
  id: string;
  name?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

async function fetchOpenAIModels(baseUrl: string, apiKey?: string): Promise<RawModel[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/v1/models`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`OpenAI API returned ${res.status}: ${res.statusText}`);

  const body = await res.json();
  const models = (body.data || []) as any[];

  return models.map((m: any) => ({
    id: m.id,
    name: m.id,
    description: m.owned_by ? `Owned by ${m.owned_by}` : undefined,
    metadata: { owned_by: m.owned_by, created: m.created },
  }));
}

async function fetchOllamaModels(baseUrl: string): Promise<RawModel[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/tags`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Ollama API returned ${res.status}: ${res.statusText}`);

  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    // Ollama sometimes returns NDJSON or extra whitespace — try first line
    const firstLine = text.split("\n").find((l) => l.trim().startsWith("{"));
    if (firstLine) {
      body = JSON.parse(firstLine);
    } else {
      throw new Error(`Ollama returned invalid JSON: ${text.slice(0, 200)}`);
    }
  }
  const models = (body.models || []) as any[];

  return models.map((m: any) => ({
    id: m.name || m.model,
    name: m.name || m.model,
    description: m.details?.family ? `Family: ${m.details.family}` : undefined,
    metadata: {
      size: m.size,
      digest: m.digest,
      modified_at: m.modified_at,
      details: m.details,
    },
  }));
}

// ============================================================================
// Auto-Detect Provider Type
// ============================================================================

type ProviderType = "openai" | "ollama" | "unknown";

function detectProviderType(baseUrl: string): ProviderType {
  const lower = baseUrl.toLowerCase();
  if (lower.includes("openai.com") || lower.includes("together.xyz") ||
      lower.includes("groq.com") || lower.includes("mistral.ai") ||
      lower.includes("perplexity.ai") || lower.includes("deepseek.com") ||
      lower.includes("x.ai") || lower.includes("cohere.com") ||
      lower.includes("anthropic.com") || lower.includes("googleapis.com") ||
      lower.includes("llama.com") || lower.includes("aliyuncs.com") ||
      lower.includes("azure.com")) {
    return "openai";
  }
  // Local URLs with common Ollama port
  if (lower.includes(":11434") || lower.includes("ollama")) {
    return "ollama";
  }
  // Default: try OpenAI-compatible API (most common)
  return "openai";
}

// ============================================================================
// Canonical URL Mapping — resolve well-known vanity URLs to actual API bases
// ============================================================================

const CANONICAL_API_URLS: Record<string, string> = {
  "openai.com": "https://api.openai.com",
  "anthropic.com": "https://api.anthropic.com",
  "mistral.ai": "https://api.mistral.ai",
  "cohere.com": "https://api.cohere.com",
  "together.xyz": "https://api.together.xyz",
  "groq.com": "https://api.groq.com",
  "perplexity.ai": "https://api.perplexity.ai",
  "deepseek.com": "https://api.deepseek.com",
  "x.ai": "https://api.x.ai",
};

function normalizeBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Check if the hostname (or its parent) maps to a canonical API URL
    for (const [domain, canonical] of Object.entries(CANONICAL_API_URLS)) {
      if (parsed.hostname === domain || parsed.hostname === `www.${domain}`) {
        return canonical;
      }
    }
  } catch { /* keep original */ }
  return url;
}

// ============================================================================
// Main Discovery Function
// ============================================================================

export async function discoverFromApiUrl(
  baseUrl: string,
  apiKey?: string
): Promise<PreviewEntry[]> {
  // Normalize well-known URLs (e.g. openai.com → api.openai.com)
  baseUrl = normalizeBaseUrl(baseUrl);

  // Validate domain
  if (!isDomainAllowed(baseUrl)) {
    throw new Error(`Domain not in allowlist. Allowed: ${getAllowedDomains().join(", ")}`);
  }

  const providerType = detectProviderType(baseUrl);
  let rawModels: RawModel[];

  try {
    if (providerType === "ollama") {
      rawModels = await fetchOllamaModels(baseUrl);
    } else {
      // OpenAI-compatible (default)
      rawModels = await fetchOpenAIModels(baseUrl, apiKey);
    }
  } catch (e: any) {
    // If OpenAI format fails, try Ollama as fallback
    if (providerType === "openai" || providerType === "unknown") {
      try {
        rawModels = await fetchOllamaModels(baseUrl);
      } catch {
        throw new Error(`Failed to discover models from ${baseUrl}: ${e.message}`);
      }
    } else {
      throw new Error(`Failed to discover models from ${baseUrl}: ${e.message}`);
    }
  }

  // Determine source label from URL
  let source = "api_discovery";
  try {
    const hostname = new URL(baseUrl).hostname;
    source = `${hostname.replace(/\./g, "_")}_api`;
  } catch { /* keep default */ }

  // Normalize to PreviewEntry
  return rawModels.map((m) => ({
    tempId: randomUUID(),
    type: "model",
    name: m.id,
    description: m.description ?? null,
    source,
    metadata: { baseUrl, providerType, ...m.metadata },
    duplicateStatus: "new" as const,
    riskLevel: "low" as const,
    validationIssues: [],
  }));
}
