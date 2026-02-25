/**
 * Provider Hub Router — Unified LLM Gateway for Operators
 *
 * ALL operator LLM calls MUST go through this module.
 * No operator may call OpenAI, Ollama, or any provider directly.
 *
 * Features:
 *   - Single endpoint abstraction
 *   - Provider selection with fallback
 *   - Response normalization
 *   - JSON output validation for operators
 *   - Token/temperature/model enforcement per operator
 *   - Full audit trail per request
 */

import { v4 as uuidv4 } from "uuid";
import type { ProviderHubRequest, ProviderHubResponse, OperatorName } from "@shared/operator-types";

// ============================================================================
// Operator Model Constraints
// ============================================================================

interface OperatorModelConstraints {
  allowedModels: string[];
  maxTokens: number;
  maxTemperature: number;
  preferredProvider: "openai" | "ollama" | "anthropic" | "auto";
  fallbackProvider: "openai" | "ollama" | "anthropic" | "none";
}

const OPERATOR_MODEL_CONSTRAINTS: Record<OperatorName, OperatorModelConstraints> = {
  builder: {
    allowedModels: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "phi3", "tinyllama", "llama3.1", "codellama", "deepseek-coder"],
    maxTokens: 16384,
    maxTemperature: 0.7,
    preferredProvider: "auto",
    fallbackProvider: "ollama",
  },
  auditor: {
    allowedModels: ["gpt-4o-mini", "gpt-4o", "phi3", "tinyllama", "llama3.1", "mistral"],
    maxTokens: 8192,
    maxTemperature: 0.3,
    preferredProvider: "auto",
    fallbackProvider: "ollama",
  },
  governance: {
    allowedModels: ["gpt-4o", "gpt-4o-mini", "phi3", "tinyllama", "llama3.1"],
    maxTokens: 4096,
    maxTemperature: 0.1,
    preferredProvider: "auto",
    fallbackProvider: "ollama",
  },
  deploy: {
    allowedModels: ["gpt-4o-mini", "gpt-4o", "phi3", "tinyllama", "llama3.1"],
    maxTokens: 8192,
    maxTemperature: 0.2,
    preferredProvider: "auto",
    fallbackProvider: "ollama",
  },
};

// ============================================================================
// Provider Clients
// ============================================================================

interface ProviderClient {
  name: string;
  available: boolean;
  call(systemPrompt: string, userPrompt: string, model: string, maxTokens: number, temperature: number): Promise<{
    content: string;
    model: string;
    tokensUsed: number;
    latencyMs: number;
  }>;
}

async function getOpenAIClient(): Promise<ProviderClient> {
  const apiKey = process.env.OPENAI_API_KEY;
  return {
    name: "openai",
    available: !!apiKey,
    async call(systemPrompt, userPrompt, model, maxTokens, temperature) {
      if (!apiKey) throw new Error("OPENAI_API_KEY not set");
      const start = Date.now();

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${errBody}`);
      }

      const data = await response.json() as any;
      return {
        content: data.choices[0].message.content,
        model: data.model,
        tokensUsed: data.usage?.total_tokens || 0,
        latencyMs: Date.now() - start,
      };
    },
  };
}

// Cache of locally available Ollama models (refreshed once per process)
let _ollamaModelsCache: string[] | null = null;

async function getAvailableOllamaModels(baseUrl: string): Promise<string[]> {
  if (_ollamaModelsCache) return _ollamaModelsCache;
  try {
    const resp = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return [];
    const data = await resp.json() as any;
    _ollamaModelsCache = (data.models || []).map((m: any) => m.name?.replace(/:latest$/, "") || "");
    console.log(`[ProviderHub] Ollama models available: ${_ollamaModelsCache!.join(", ")}`);
    return _ollamaModelsCache!;
  } catch {
    return [];
  }
}

function pickBestOllamaModel(allowedModels: string[], availableModels: string[]): string | null {
  // Try exact match first (prefer models earlier in the allowed list — higher priority)
  for (const allowed of allowedModels) {
    if (availableModels.includes(allowed)) return allowed;
  }
  // Try prefix match (e.g. "phi3" matches "phi3:3.8b")
  for (const allowed of allowedModels) {
    const match = availableModels.find(m => m.startsWith(allowed));
    if (match) return match;
  }
  return null;
}

async function getOllamaClient(): Promise<ProviderClient> {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const availableModels = await getAvailableOllamaModels(baseUrl);
  return {
    name: "ollama",
    available: availableModels.length > 0,
    async call(systemPrompt, userPrompt, model, maxTokens, temperature) {
      const start = Date.now();
      // Use the requested model if available, otherwise pick the best available one
      const effectiveModel = availableModels.includes(model) ? model
        : availableModels.includes(model.replace(/:latest$/, "")) ? model.replace(/:latest$/, "")
        : model; // fallback to requested — Ollama will error if not found

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: effectiveModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          stream: false,
          options: {
            num_predict: maxTokens,
            temperature,
          },
          format: "json",
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`Ollama API error ${response.status}: ${errText}`);
      }

      const data = await response.json() as any;
      return {
        content: data.message?.content || "",
        model: data.model || effectiveModel,
        tokensUsed: (data.eval_count || 0) + (data.prompt_eval_count || 0),
        latencyMs: Date.now() - start,
      };
    },
  };
}

// ============================================================================
// Provider Hub — Main entry point
// ============================================================================

export async function callProviderHub(request: ProviderHubRequest): Promise<ProviderHubResponse> {
  const constraints = OPERATOR_MODEL_CONSTRAINTS[request.operator];
  if (!constraints) {
    throw new Error(`Unknown operator: ${request.operator}`);
  }

  // Enforce constraints
  const effectiveMaxTokens = Math.min(request.maxTokens, constraints.maxTokens);
  const effectiveTemperature = Math.min(request.temperature, constraints.maxTemperature);

  // Build provider chain
  const openai = await getOpenAIClient();
  const ollama = await getOllamaClient();
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const availableOllamaModels = await getAvailableOllamaModels(ollamaBaseUrl);

  const providerChain: Array<{ client: ProviderClient; model: string }> = [];

  // Pick best model for each provider
  const bestOllamaModel = pickBestOllamaModel(constraints.allowedModels, availableOllamaModels);
  const openaiModel = constraints.allowedModels.find(m => m.startsWith("gpt-")) || "gpt-4o-mini";

  if (constraints.preferredProvider === "auto") {
    if (openai.available) providerChain.push({ client: openai, model: openaiModel });
    if (ollama.available && bestOllamaModel) providerChain.push({ client: ollama, model: bestOllamaModel });
  } else if (constraints.preferredProvider === "openai") {
    if (openai.available) providerChain.push({ client: openai, model: openaiModel });
    if (constraints.fallbackProvider === "ollama" && ollama.available && bestOllamaModel) providerChain.push({ client: ollama, model: bestOllamaModel });
  } else if (constraints.preferredProvider === "ollama") {
    if (ollama.available && bestOllamaModel) providerChain.push({ client: ollama, model: bestOllamaModel });
    if (constraints.fallbackProvider === "openai" && openai.available) providerChain.push({ client: openai, model: openaiModel });
  }

  if (providerChain.length === 0) {
    throw new Error(`No LLM providers available (OpenAI key: ${openai.available ? "set" : "not set"}, Ollama models: [${availableOllamaModels.join(",")}], needed: [${constraints.allowedModels.join(",")}])`);
  }

  // Try providers in order with fallback
  let lastError: Error | null = null;
  let fallbackUsed = false;

  for (let i = 0; i < providerChain.length; i++) {
    const { client: provider, model } = providerChain[i];

    try {
      const result = await provider.call(
        request.systemPrompt,
        request.userPrompt,
        model,
        effectiveMaxTokens,
        effectiveTemperature,
      );

      // Validate JSON response
      let content = result.content.trim();
      try {
        JSON.parse(content);
      } catch {
        // Retry once with same provider asking for valid JSON
        const retryResult = await provider.call(
          request.systemPrompt + "\n\nCRITICAL: Your previous response was not valid JSON. You MUST respond with valid JSON only.",
          request.userPrompt,
          model,
          effectiveMaxTokens,
          effectiveTemperature,
        );
        content = retryResult.content.trim();
        JSON.parse(content); // Will throw if still invalid, triggering fallback
      }

      console.log(`[ProviderHub] ${request.operator}/${request.jobId} → ${provider.name}/${model} (${result.tokensUsed} tokens, ${result.latencyMs}ms${fallbackUsed ? ", fallback" : ""})`);

      return {
        content,
        model: result.model,
        provider: provider.name,
        tokensUsed: result.tokensUsed,
        latencyMs: result.latencyMs,
        traceId: request.traceId,
        fallbackUsed,
      };
    } catch (error: any) {
      lastError = error;
      fallbackUsed = true;
      console.warn(`[ProviderHub] ${provider.name} failed for ${request.operator}: ${error.message}`);
      continue;
    }
  }

  throw new Error(`All providers failed for operator "${request.operator}": ${lastError?.message}`);
}
