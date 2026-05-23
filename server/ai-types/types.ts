/**
 * AI Types Domain — Shared Types
 *
 * BOUNDARY: Internal to AI Types domain.
 * Other modules consume through catalog_entries and runtime APIs.
 */

// ── Entry Types ─────────────────────────────────────────────────────────

/**
 * `catalog_entries.entryType` taxonomy — what KIND of asset the row
 * is. Distinct from `AISourceType` (which source-of-truth table the
 * row points at). Per the 2026-05-23 extension to
 * `docs/architecture/provider-model-binding/CATALOG_SOURCE_MAPPING.md`
 * locked rule #4: "Conflating the two is the root cause of the drift
 * this extension corrects."
 */
export type AIEntryType = "provider" | "llm" | "model" | "agent" | "bot";

// ── Source Types ────────────────────────────────────────────────────────

/**
 * `catalog_entries.sourceType` canonical vocabulary per
 * `docs/architecture/provider-model-binding/CATALOG_SOURCE_MAPPING.md`
 * §17-28 + the 2026-05-23 AI Types domain-table extension at the
 * bottom of that doc.
 *
 * Each value names the source-of-truth table that `sourceId` points
 * at. Legacy values (`model`, `llm`) are RESERVED for the original
 * mapping (`models.id`, `llm_authority.id`); the new AI Types domain
 * tables get their own canonical sourceType (`ai_type_model`,
 * `ai_type_llm`).
 *
 * NOTE: `agent` and `bot` are kept here for back-compat with existing
 * `linkCatalogToDomain` callers; the canonical spec lists `ags_agent`
 * for Agent Studio-published agents (a separate ADR alignment).
 */
export type AISourceType =
  | "provider"
  | "model"          // legacy `models` table
  | "ai_type_model"  // canonical for `ai_type_models` (added 2026-05-23)
  | "llm"            // legacy `llm_authority` table
  | "ai_type_llm"    // canonical for `ai_type_llms` (added 2026-05-23)
  | "agent"
  | "bot"
  | "ags_agent"
  | "ai_type";

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
  /**
   * Canonical `catalog_entries.sourceType` value per
   * `CATALOG_SOURCE_MAPPING.md`. Distinct from `entryType` —
   * `entryType` is the asset kind, `sourceType` is the
   * source-of-truth table pointer. Per the 2026-05-23 extension's
   * locked rule #4, callers MUST pass this explicitly rather than
   * letting the projection layer derive it from `entryType`.
   */
  sourceType: AISourceType;
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
