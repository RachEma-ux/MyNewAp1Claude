/**
 * AI Types Domain Service
 *
 * Unified domain service wrapping CRUD for each AI Types table.
 * After each domain write, projects/refreshes the corresponding catalog entry.
 * Enforces: domain write → catalog projection (never catalog-only writes for AI Types).
 *
 * BOUNDARY: Internal to AI Types domain.
 * Other modules consume through catalog_entries and runtime APIs.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/connection";
import {
  aiTypeModels,
  aiTypeLlms,
  providers,
  agents,
  bots,
} from "../../drizzle/schema";
import type {
  AIEntryType,
  DomainModelData,
  DomainLlmData,
  DomainProviderData,
  ProjectionResult,
} from "./types";
import {
  projectToCatalog,
  refreshCatalogProjection,
  findCatalogEntryBySource,
  linkCatalogToDomain,
} from "./projection";

// ============================================================================
// Model CRUD + Catalog Projection
// ============================================================================

export async function createModel(data: DomainModelData): Promise<ProjectionResult> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // 1. Write to domain table
  const [model] = await db.insert(aiTypeModels).values({
    name: data.name,
    displayName: data.displayName ?? data.name,
    description: data.description ?? null,
    providerId: data.providerId ?? null,
    providerSlug: data.providerSlug ?? null,
    modelFamily: data.modelFamily ?? null,
    contextLength: data.contextLength ?? null,
    capabilities: data.capabilities ?? null,
    apiModelId: data.apiModelId ?? null,
    baseUrl: data.baseUrl ?? null,
    config: data.config ?? {},
    canonicalKey: data.canonicalKey ?? null,
    status: data.status ?? "active",
    createdBy: data.createdBy ?? 1,
  }).returning();

  // 2. Project to catalog
  const catalogEntry = await projectToCatalog({
    domainId: model.id,
    entryType: "model",
    // Canonical sourceType per CATALOG_SOURCE_MAPPING.md 2026-05-23
    // extension: ai_type_models rows project as sourceType="ai_type_model".
    sourceType: "ai_type_model",
    name: data.name,
    displayName: data.displayName,
    description: data.description,
    providerId: data.providerId,
    config: {
      ...(data.config ?? {}),
      providerId: data.providerSlug ?? data.providerId,
      providerName: data.providerSlug,
      contextLength: data.contextLength,
      size: null,
    },
    capabilities: data.capabilities,
    category: "base_llm",
    subCategory: data.contextLength && data.contextLength >= 100000 ? "multimodal" : "text_only",
    tags: data.providerSlug ? [data.providerSlug] : [],
    status: data.status ?? "active",
    origin: "admin",
    reviewState: "approved",
    createdBy: data.createdBy,
  });

  return {
    domainEntity: model as any,
    catalogEntry: catalogEntry as any,
  };
}

export async function updateModel(
  id: number,
  data: Partial<DomainModelData>
): Promise<ProjectionResult> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // 1. Update domain table
  const updateFields: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updateFields.name = data.name;
  if (data.displayName !== undefined) updateFields.displayName = data.displayName;
  if (data.description !== undefined) updateFields.description = data.description;
  if (data.providerId !== undefined) updateFields.providerId = data.providerId;
  if (data.providerSlug !== undefined) updateFields.providerSlug = data.providerSlug;
  if (data.modelFamily !== undefined) updateFields.modelFamily = data.modelFamily;
  if (data.contextLength !== undefined) updateFields.contextLength = data.contextLength;
  if (data.capabilities !== undefined) updateFields.capabilities = data.capabilities;
  if (data.apiModelId !== undefined) updateFields.apiModelId = data.apiModelId;
  if (data.baseUrl !== undefined) updateFields.baseUrl = data.baseUrl;
  if (data.config !== undefined) updateFields.config = data.config;
  if (data.canonicalKey !== undefined) updateFields.canonicalKey = data.canonicalKey;
  if (data.status !== undefined) updateFields.status = data.status;

  const [model] = await db
    .update(aiTypeModels)
    .set(updateFields as any)
    .where(eq(aiTypeModels.id, id))
    .returning();

  if (!model) throw new Error(`Model ${id} not found`);

  // 2. Refresh catalog projection. Canonical sourceType per the
  // 2026-05-23 extension to CATALOG_SOURCE_MAPPING.md.
  const catalogLink = await findCatalogEntryBySource("ai_type_model", id);
  if (catalogLink) {
    await refreshCatalogProjection(catalogLink.id, {
      domainId: id,
      entryType: "model",
      sourceType: "ai_type_model",
      name: model.name,
      displayName: model.displayName,
      description: model.description,
      providerId: model.providerId,
      config: {
        ...(model.config as Record<string, unknown> ?? {}),
        providerId: model.providerSlug ?? model.providerId,
        contextLength: model.contextLength,
      },
      capabilities: model.capabilities as string[] | null,
    });
  }

  return {
    domainEntity: model as any,
    catalogEntry: catalogLink as any ?? { id: null },
  };
}

export async function getModelById(id: number) {
  const db = getDb();
  if (!db) return null;

  const [model] = await db
    .select()
    .from(aiTypeModels)
    .where(eq(aiTypeModels.id, id))
    .limit(1);

  return model ?? null;
}

// ============================================================================
// LLM CRUD + Catalog Projection
// ============================================================================

export async function createLlm(data: DomainLlmData): Promise<ProjectionResult> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [llm] = await db.insert(aiTypeLlms).values({
    name: data.name,
    displayName: data.displayName ?? data.name,
    description: data.description ?? null,
    providerId: data.providerId ?? null,
    modelId: data.modelId ?? null,
    role: data.role ?? null,
    config: data.config ?? {},
    canonicalKey: data.canonicalKey ?? null,
    status: data.status ?? "active",
    createdBy: data.createdBy ?? 1,
  }).returning();

  const catalogEntry = await projectToCatalog({
    domainId: llm.id,
    entryType: "llm",
    // Canonical sourceType per CATALOG_SOURCE_MAPPING.md 2026-05-23
    // extension: ai_type_llms rows project as sourceType="ai_type_llm".
    sourceType: "ai_type_llm",
    name: data.name,
    displayName: data.displayName,
    description: data.description,
    providerId: data.providerId,
    config: data.config,
    tags: data.role ? [data.role] : [],
    status: data.status ?? "active",
    origin: "admin",
    reviewState: "approved",
    createdBy: data.createdBy,
  });

  return {
    domainEntity: llm as any,
    catalogEntry: catalogEntry as any,
  };
}

export async function updateLlm(
  id: number,
  data: Partial<DomainLlmData>
): Promise<ProjectionResult> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const updateFields: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updateFields.name = data.name;
  if (data.displayName !== undefined) updateFields.displayName = data.displayName;
  if (data.description !== undefined) updateFields.description = data.description;
  if (data.providerId !== undefined) updateFields.providerId = data.providerId;
  if (data.modelId !== undefined) updateFields.modelId = data.modelId;
  if (data.role !== undefined) updateFields.role = data.role;
  if (data.config !== undefined) updateFields.config = data.config;
  if (data.canonicalKey !== undefined) updateFields.canonicalKey = data.canonicalKey;
  if (data.status !== undefined) updateFields.status = data.status;

  const [llm] = await db
    .update(aiTypeLlms)
    .set(updateFields as any)
    .where(eq(aiTypeLlms.id, id))
    .returning();

  if (!llm) throw new Error(`LLM ${id} not found`);

  // Canonical sourceType per the 2026-05-23 extension to
  // CATALOG_SOURCE_MAPPING.md.
  const catalogLink = await findCatalogEntryBySource("ai_type_llm", id);
  if (catalogLink) {
    await refreshCatalogProjection(catalogLink.id, {
      domainId: id,
      entryType: "llm",
      sourceType: "ai_type_llm",
      name: llm.name,
      displayName: llm.displayName,
      description: llm.description,
      providerId: llm.providerId,
      config: llm.config as Record<string, unknown> ?? {},
    });
  }

  return {
    domainEntity: llm as any,
    catalogEntry: catalogLink as any ?? { id: null },
  };
}

export async function getLlmById(id: number) {
  const db = getDb();
  if (!db) return null;

  const [llm] = await db
    .select()
    .from(aiTypeLlms)
    .where(eq(aiTypeLlms.id, id))
    .limit(1);

  return llm ?? null;
}

// ============================================================================
// Provider Domain Helpers (existing table — thin wrappers for consistency)
// ============================================================================

/**
 * Create a provider in the domain table and project to catalog.
 * The providers table already exists — this wraps it with catalog projection.
 */
export async function createProviderWithProjection(
  data: DomainProviderData,
  createdBy: number = 1
): Promise<ProjectionResult> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [provider] = await db.insert(providers).values({
    name: data.name,
    type: data.type,
    enabled: data.enabled ?? true,
    priority: data.priority ?? 50,
    config: data.config,
    kind: data.kind as any ?? "cloud",
    capabilities: data.capabilities as any ?? null,
  }).returning();

  const category = data.kind === "local" ? "local_runtime" : "cloud_api";

  const catalogEntry = await projectToCatalog({
    domainId: provider.id,
    entryType: "provider",
    // sourceType matches entryType for `providers` rows per
    // CATALOG_SOURCE_MAPPING.md §17-28 (the providers table is
    // the canonical source-of-truth for `entryType="provider"`).
    sourceType: "provider",
    name: data.name,
    displayName: data.name,
    description: `Provider: ${data.type}`,
    providerId: provider.id,
    config: {
      providerType: data.type,
      kind: data.kind ?? "cloud",
      registryId: data.type,
    },
    category,
    tags: [data.type, data.kind ?? "cloud"].filter(Boolean),
    status: "active",
    origin: "admin",
    reviewState: "approved",
    createdBy,
  });

  return {
    domainEntity: provider as any,
    catalogEntry: catalogEntry as any,
  };
}

// ============================================================================
// Domain Resolution (from catalog entry back to domain)
// ============================================================================

/**
 * Resolve a domain entity from a catalog entry's sourceType + sourceId.
 * Returns the domain record or null if not linked / not found.
 */
export async function resolveDomainEntity(
  sourceType: AIEntryType | string | null,
  sourceId: number | null
): Promise<Record<string, unknown> | null> {
  if (!sourceType || !sourceId) return null;

  const db = getDb();
  if (!db) return null;

  switch (sourceType) {
    case "model": {
      const [m] = await db.select().from(aiTypeModels).where(eq(aiTypeModels.id, sourceId)).limit(1);
      return m ? (m as any) : null;
    }
    case "llm": {
      const [l] = await db.select().from(aiTypeLlms).where(eq(aiTypeLlms.id, sourceId)).limit(1);
      return l ? (l as any) : null;
    }
    case "provider": {
      const [p] = await db.select().from(providers).where(eq(providers.id, sourceId)).limit(1);
      return p ? (p as any) : null;
    }
    case "agent": {
      const [a] = await db.select().from(agents).where(eq(agents.id, sourceId)).limit(1);
      return a ? (a as any) : null;
    }
    case "bot": {
      const [b] = await db.select().from(bots).where(eq(bots.id, sourceId)).limit(1);
      return b ? (b as any) : null;
    }
    default:
      return null;
  }
}

/**
 * Resolve a provider from a catalog entry.
 * Tries: sourceType=provider → sourceId, then entry.providerId, then config.providerId.
 */
export async function resolveProviderFromCatalogEntry(entry: {
  sourceType?: string | null;
  sourceId?: number | null;
  providerId?: number | null;
  config?: Record<string, unknown> | null;
}): Promise<{ id: number; name: string; type: string; config: any } | null> {
  const db = getDb();
  if (!db) return null;

  // 1. Domain link: sourceType=provider → sourceId
  if (entry.sourceType === "provider" && entry.sourceId) {
    const [p] = await db.select().from(providers).where(eq(providers.id, entry.sourceId)).limit(1);
    if (p) return p;
  }

  // 2. For model/llm entries: resolve their domain entity's providerId
  if ((entry.sourceType === "model" || entry.sourceType === "llm") && entry.sourceId) {
    const domain = await resolveDomainEntity(entry.sourceType, entry.sourceId);
    if (domain?.providerId) {
      const [p] = await db.select().from(providers).where(eq(providers.id, domain.providerId as number)).limit(1);
      if (p) return p;
    }
  }

  // 3. Direct providerId on catalog entry
  if (entry.providerId) {
    const [p] = await db.select().from(providers).where(eq(providers.id, entry.providerId)).limit(1);
    if (p) return p;
  }

  // 4. Legacy: config.providerId (numeric)
  const config = entry.config ?? {};
  if (config.providerId) {
    const parsed = typeof config.providerId === "number"
      ? config.providerId
      : parseInt(String(config.providerId), 10);
    if (!isNaN(parsed)) {
      const [p] = await db.select().from(providers).where(eq(providers.id, parsed)).limit(1);
      if (p) return p;
    }
  }

  return null;
}
