/**
 * AI Types Domain — Shared Types
 *
 * BOUNDARY: Internal to AI Types domain.
 * Other modules consume through catalog_entries and runtime APIs.
 */

// ── Entry Types ─────────────────────────────────────────────────────────

export type AIEntryType = "provider" | "llm" | "model" | "agent" | "bot";

// ── Domain Table Map ────────────────────────────────────────────────────

/**
 * Maps entry types to their domain table identifiers.
 * Used by the projection layer to route domain writes.
 */
export const DOMAIN_TABLE_MAP: Record<AIEntryType, string> = {
  provider: "providers",
  llm: "ai_type_llms",
  model: "ai_type_models",
  agent: "agents",
  bot: "bots",
};

// ── Domain Entity Shapes ────────────────────────────────────────────────

export interface DomainModelData {
  name: string;
  displayName?: string;
  description?: string;
  providerId?: number | null;
  providerSlug?: string | null;
  modelFamily?: string | null;
  contextLength?: number | null;
  capabilities?: string[] | null;
  apiModelId?: string | null;
  baseUrl?: string | null;
  config?: Record<string, unknown> | null;
  canonicalKey?: string | null;
  status?: string;
  createdBy?: number | null;
}

export interface DomainLlmData {
  name: string;
  displayName?: string;
  description?: string;
  providerId?: number | null;
  modelId?: number | null;
  role?: string | null;
  config?: Record<string, unknown> | null;
  canonicalKey?: string | null;
  status?: string;
  createdBy?: number | null;
}

export interface DomainProviderData {
  name: string;
  type: string;
  enabled?: boolean;
  priority?: number;
  config: Record<string, unknown>;
  kind?: string;
  capabilities?: string[];
  canonicalKey?: string | null;
}

// ── Projection Result ───────────────────────────────────────────────────

export interface ProjectionResult {
  domainEntity: { id: number; [key: string]: unknown };
  catalogEntry: { id: number; [key: string]: unknown };
}

// ── Catalog Projection Input ────────────────────────────────────────────

export interface CatalogProjectionInput {
  domainId: number;
  entryType: AIEntryType;
  name: string;
  displayName?: string | null;
  description?: string | null;
  providerId?: number | null;
  config?: Record<string, unknown> | null;
  tags?: string[];
  category?: string | null;
  subCategory?: string | null;
  capabilities?: string[] | null;
  scope?: string;
  status?: string;
  origin?: string;
  reviewState?: string;
  createdBy?: number;
}
