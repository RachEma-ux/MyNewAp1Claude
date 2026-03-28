/**
 * AI Types Import Normalizer
 *
 * Normalizes import data (from API discovery or file upload) into
 * domain entity shapes before writing to domain tables.
 *
 * BOUNDARY: Internal to AI Types domain.
 */

import type { DomainModelData, DomainLlmData } from "./types";
import { getAllProviders } from "../providers/db";

// ── Provider Slug Resolution ────────────────────────────────────────────

/** Map common provider type slugs to DB provider types */
const PROVIDER_TYPE_MAP: Record<string, string> = {
  ollama: "local-ollama",
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  groq: "groq",
};

/**
 * Resolve a provider slug (e.g. "openai") or numeric ID to a providers.id.
 * Checks DB providers for a match by type or by ID.
 */
export async function resolveProviderId(
  slug: string | number | null | undefined,
  baseUrl?: string | null
): Promise<number | null> {
  if (!slug) return null;

  // Numeric ID — check if it exists
  if (typeof slug === "number" || !isNaN(Number(slug))) {
    const numId = typeof slug === "number" ? slug : parseInt(String(slug), 10);
    const allProviders = await getAllProviders();
    const match = allProviders.find((p: any) => p.id === numId);
    return match ? numId : null;
  }

  // String slug — map to DB type and find
  const dbType = PROVIDER_TYPE_MAP[slug] || slug;
  const allProviders = await getAllProviders();
  const match = allProviders.find((p: any) => {
    if (p.type !== dbType) return false;
    if (baseUrl) {
      const pConfig = (p.config as Record<string, any>) || {};
      return pConfig.baseUrl === baseUrl;
    }
    return true;
  });

  return match?.id ?? null;
}

// ── Normalize Import Row to Domain Model ────────────────────────────────

export interface ImportRowLike {
  name: string;
  description?: string | null;
  type: string;
  metadata?: Record<string, any> | null;
  source?: string;
}

/**
 * Normalize an import preview row into a DomainModelData shape.
 * Extracts type-specific fields from the metadata blob.
 */
export async function normalizeToModel(
  row: ImportRowLike,
  runtimeDefaults?: { providerId?: string; modelId?: string }
): Promise<DomainModelData> {
  const meta = row.metadata ?? {};

  // Resolve provider ID
  let providerId = await resolveProviderId(
    runtimeDefaults?.providerId ?? meta.providerId,
    meta.baseUrl
  );

  // Fallback: resolve providerType slug
  if (!providerId && meta.providerType) {
    providerId = await resolveProviderId(meta.providerType, meta.baseUrl);
  }

  return {
    name: row.name,
    displayName: meta.displayName || row.name,
    description: row.description ?? meta.description ?? null,
    providerId,
    providerSlug: meta.providerType ?? meta.providerId ?? null,
    modelFamily: meta.modelFamily ?? null,
    contextLength: meta.contextLength ?? null,
    capabilities: Array.isArray(meta.capabilities) ? meta.capabilities : null,
    apiModelId: runtimeDefaults?.modelId ?? meta.model ?? row.name,
    baseUrl: meta.baseUrl ?? null,
    config: meta,
    canonicalKey: meta.providerType
      ? `${meta.providerType}/${row.name}`
      : null,
    status: "active",
    createdBy: 1,
  };
}

/**
 * Normalize an import preview row into a DomainLlmData shape.
 */
export async function normalizeToLlm(
  row: ImportRowLike,
  runtimeDefaults?: { providerId?: string; llmId?: string; modelId?: string }
): Promise<DomainLlmData> {
  const meta = row.metadata ?? {};

  const providerId = await resolveProviderId(
    runtimeDefaults?.providerId ?? meta.providerId,
    meta.baseUrl
  );

  return {
    name: row.name,
    displayName: meta.displayName || row.name,
    description: row.description ?? meta.description ?? null,
    providerId,
    modelId: null, // Will be resolved later if needed
    role: meta.role ?? null,
    config: meta,
    canonicalKey: null,
    status: "active",
    createdBy: 1,
  };
}

/**
 * Determine which domain table an import row targets based on its type.
 */
export function getDomainTarget(entryType: string): "model" | "llm" | "provider" | "agent" | "bot" | null {
  switch (entryType) {
    case "model": return "model";
    case "llm": return "llm";
    case "provider": return "provider";
    case "agent": return "agent";
    case "bot": return "bot";
    default: return null;
  }
}
