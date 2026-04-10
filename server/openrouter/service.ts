/**
 * OpenRouter — Core Service
 *
 * Connection management, validation, health checks.
 * All secrets handled server-side only via platform encryption.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/connection";
import { openrouterConfig, openrouterActivity } from "./schema";
import { encrypt, decrypt } from "../secrets/encryption";

const OPENROUTER_API = "https://openrouter.ai/api/v1";

// ── Config CRUD ────────────────────────────────────────────────────

export async function getConfig(): Promise<typeof openrouterConfig.$inferSelect | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db.select().from(openrouterConfig).limit(1);
  return row ?? null;
}

export async function saveConfig(params: {
  apiKey?: string;
  endpoint?: string;
  siteUrl?: string;
  siteName?: string;
  enabled?: boolean;
  defaultModelId?: string;
}): Promise<typeof openrouterConfig.$inferSelect> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const existing = await getConfig();

  const encryptedKey = params.apiKey ? encrypt(params.apiKey) : existing?.apiKey;

  if (existing) {
    const [row] = await db
      .update(openrouterConfig)
      .set({
        apiKey: encryptedKey ?? existing.apiKey,
        endpoint: params.endpoint ?? existing.endpoint,
        siteUrl: params.siteUrl !== undefined ? params.siteUrl : existing.siteUrl,
        siteName: params.siteName !== undefined ? params.siteName : existing.siteName,
        enabled: params.enabled !== undefined ? params.enabled : existing.enabled,
        defaultModelId: params.defaultModelId !== undefined ? params.defaultModelId : existing.defaultModelId,
        updatedAt: new Date(),
      })
      .where(eq(openrouterConfig.id, existing.id))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(openrouterConfig)
    .values({
      apiKey: encryptedKey ?? null,
      endpoint: params.endpoint ?? OPENROUTER_API,
      siteUrl: params.siteUrl,
      siteName: params.siteName,
      enabled: params.enabled ?? false,
      defaultModelId: params.defaultModelId,
    })
    .returning();
  return row;
}

// ── Connection Test ────────────────────────────────────────────────

export interface ConnectionTestResult {
  connected: boolean;
  latencyMs: number;
  modelsAvailable?: number;
  error?: string;
  keyValid?: boolean;
}

export async function testConnection(apiKey?: string): Promise<ConnectionTestResult> {
  const config = await getConfig();
  const key = apiKey ?? (config?.apiKey ? decrypt(config.apiKey) : null);
  const endpoint = config?.endpoint ?? OPENROUTER_API;

  if (!key) {
    return { connected: false, latencyMs: 0, error: "No API key configured" };
  }

  const start = Date.now();

  try {
    const res = await fetch(`${endpoint}/models`, {
      headers: {
        "Authorization": `Bearer ${key}`,
        "HTTP-Referer": config?.siteUrl ?? "http://localhost:3000",
        "X-Title": config?.siteName ?? "MyNewAp1Claude",
      },
    });

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      return {
        connected: false,
        latencyMs,
        error: `HTTP ${res.status}: ${res.statusText}`,
        keyValid: res.status !== 401 && res.status !== 403,
      };
    }

    const data = await res.json() as { data?: unknown[] };
    return {
      connected: true,
      latencyMs,
      modelsAvailable: data.data?.length ?? 0,
      keyValid: true,
    };
  } catch (err) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: (err as Error).message,
    };
  }
}

// ── Health Check ───────────────────────────────────────────────────

export async function healthCheck(): Promise<{
  status: "healthy" | "degraded" | "down" | "unconfigured";
  latencyMs: number;
  details: Record<string, unknown>;
}> {
  const config = await getConfig();
  if (!config?.apiKey || !config.enabled) {
    return { status: "unconfigured", latencyMs: 0, details: { reason: "Not configured or disabled" } };
  }

  const test = await testConnection();

  const db = getDb();
  if (db && config) {
    await db
      .update(openrouterConfig)
      .set({
        lastHealthCheck: new Date(),
        healthStatus: test.connected ? "healthy" : "degraded",
        updatedAt: new Date(),
      })
      .where(eq(openrouterConfig.id, config.id));
  }

  return {
    status: test.connected ? "healthy" : "degraded",
    latencyMs: test.latencyMs,
    details: {
      modelsAvailable: test.modelsAvailable,
      keyValid: test.keyValid,
      error: test.error,
      endpoint: config.endpoint,
    },
  };
}

// ── Execution (chat/embeddings) ────────────────────────────────────

export interface ChatRequest {
  model: string;
  messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  responseFormat?: { type: string };
  tools?: Array<{ type: string; function: { name: string; description: string; parameters: unknown } }>;
  routingProfile?: { order?: string[]; allowFallbacks?: boolean };
}

export interface ChatResponse {
  id: string;
  model: string;
  choices: Array<{
    message: { role: string; content: string; tool_calls?: unknown[] };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  provider?: string;
}

export async function executeChat(request: ChatRequest): Promise<ChatResponse> {
  const config = await getConfig();
  if (!config?.apiKey || !config.enabled) {
    throw new Error("OpenRouter not configured or disabled");
  }

  const key = decrypt(config.apiKey);
  const endpoint = config.endpoint ?? OPENROUTER_API;

  const body: Record<string, unknown> = {
    model: request.model,
    messages: request.messages,
  };
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.maxTokens) body.max_tokens = request.maxTokens;
  if (request.stream) body.stream = true;
  if (request.responseFormat) body.response_format = request.responseFormat;
  if (request.tools) body.tools = request.tools;
  if (request.routingProfile) {
    if (request.routingProfile.order) body.provider = { order: request.routingProfile.order };
    if (request.routingProfile.allowFallbacks !== undefined) body.provider = { ...body.provider as any, allow_fallbacks: request.routingProfile.allowFallbacks };
  }

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": config.siteUrl ?? "http://localhost:3000",
    "X-Title": config.siteName ?? "MyNewAp1Claude",
  };

  const res = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${errBody}`);
  }

  return res.json();
}

export async function executeEmbedding(model: string, input: string[]): Promise<{
  data: Array<{ embedding: number[]; index: number }>;
  usage: { prompt_tokens: number; total_tokens: number };
}> {
  const config = await getConfig();
  if (!config?.apiKey || !config.enabled) {
    throw new Error("OpenRouter not configured or disabled");
  }

  const key = decrypt(config.apiKey);
  const endpoint = config.endpoint ?? OPENROUTER_API;

  const res = await fetch(`${endpoint}/embeddings`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": config.siteUrl ?? "http://localhost:3000",
      "X-Title": config.siteName ?? "MyNewAp1Claude",
    },
    body: JSON.stringify({ model, input }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenRouter embeddings ${res.status}: ${errBody}`);
  }

  return res.json();
}

// ── Activity Logging ───────────────────────────────────────────────

export async function logActivity(action: string, actorId?: number, details?: string, metadata?: Record<string, unknown>): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.insert(openrouterActivity).values({ action, actorId, details, metadata });
  } catch (err) {
    console.warn(`[OpenRouter] Failed to log activity: ${(err as Error).message}`);
  }
}

// ── Safe config for client (no secrets) ────────────────────────────

export async function getClientSafeConfig(): Promise<{
  configured: boolean;
  enabled: boolean;
  hasApiKey: boolean;
  endpoint: string;
  siteUrl: string | null;
  siteName: string | null;
  defaultModelId: string | null;
  healthStatus: string;
  lastSyncAt: string | null;
  lastHealthCheck: string | null;
} | null> {
  const config = await getConfig();
  if (!config) return null;
  return {
    configured: !!config.apiKey,
    enabled: config.enabled,
    hasApiKey: !!config.apiKey,
    endpoint: config.endpoint,
    siteUrl: config.siteUrl,
    siteName: config.siteName,
    defaultModelId: config.defaultModelId,
    healthStatus: config.healthStatus,
    lastSyncAt: config.lastSyncAt?.toISOString() ?? null,
    lastHealthCheck: config.lastHealthCheck?.toISOString() ?? null,
  };
}
