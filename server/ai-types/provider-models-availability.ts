/**
 * AI Types — provider/model availability contract.
 *
 * Plan v3 Phase 7. Adds the read-only listing that any module
 * (Agent Studio, OpenRouter, automation) consumes when it needs to
 * know "what provider+model pairs may be selected for a binding."
 *
 * This file is the second leg of the Provider/Model Binding split:
 *
 *   - Provider Connections (Phase 1–2): connection-level availability
 *     (does an active, validated credential exist?).
 *   - AI Types (this file): catalog-level availability (is the
 *     provider/model entry approved, active, and not frozen?).
 *
 * A binding is creatable only when BOTH legs return ok. Phase 8
 * formalizes the Provider Connections side; Phase 9–11 wire Agent
 * Studio to consume both.
 *
 * Critical invariant: this function MUST NOT return any credential-
 * shaped field. Tests assert on a forbidden-key list. The
 * `withProviderCredential` resolver is the only place outside
 * `server/secrets/` that holds a decrypted PAT (D2) — this catalog
 * read explicitly excludes it.
 */

import { eq, and, inArray } from "drizzle-orm";
import {
  catalogEntries,
  type CatalogEntry,
} from "../../drizzle/schema";
import { aiTypeModels, type AiTypeModel } from "../../drizzle/tables/ai-types";
import { providers, type Provider } from "../../drizzle/tables/providers";
import { getDb } from "../db/connection";
import { isCatalogEntryAvailableForAppUse } from "./availability";

export interface ListAvailableProviderModelsInput {
  /** Filter to a single provider slug (e.g. "openai", "anthropic"). */
  providerSlug?: string;
  /** Filter to models that advertise a specific capability. */
  capability?: string;
  /** Reserved for future scoping; not used at Phase 7. */
  workspaceId?: number;
}

export interface ProviderModelGovernanceStatus {
  /** `catalog_entries.status` for the model entry. */
  status: string;
  /** `catalog_entries.reviewState` for the model entry. */
  reviewState: string;
  /** Combined check from `availability.ts#isCatalogEntryAvailableForAppUse`. */
  available: boolean;
  /** Blocking reasons when `available=false`; empty when ok. */
  reasons: string[];
}

export interface ProviderModelRestrictions {
  /** Provider-level policy tags propagated from `providers.policyTags`. */
  policyTags: string[] | null;
  /** Model entry frozen (production lockdown). */
  frozen: boolean;
  /** Reason supplied when the entry was frozen. */
  freezeReason: string | null;
}

export interface AvailableProviderModel {
  /** Catalog entry id for the provider, when one exists. */
  providerCatalogEntryId: number | null;
  /** Underlying `providers.id`. */
  providerId: number;
  /** Provider slug, e.g. "openai". */
  providerSlug: string;
  /** Human display name. */
  providerName: string;
  /** Provider type, e.g. "openai" / "anthropic" / "ollama". */
  providerType: string;

  /** Catalog entry id for the model, when one exists. */
  modelCatalogEntryId: number | null;
  /** Underlying `ai_type_models.id`. */
  modelId: number;
  /**
   * The string Model Access sends to the provider — `apiModelId` if
   * present, else `canonicalKey` minus the leading provider slug, else
   * `name`. Falling back keeps the contract honest even for legacy rows.
   */
  modelRef: string;
  /** Friendlier display name; nullable. */
  modelDisplayName: string | null;
  /** Provider-declared capabilities, propagated through. */
  capabilities: string[];

  /** See `ProviderModelGovernanceStatus`. */
  governanceStatus: ProviderModelGovernanceStatus;
  /** See `ProviderModelRestrictions`. */
  restrictions: ProviderModelRestrictions;
}

/**
 * Forbidden field list — used by the test suite. Anything resembling
 * a credential must NOT appear in the response. Keeping the list
 * here makes the intent grep-able from the call site.
 */
export const FORBIDDEN_AVAILABILITY_KEYS: ReadonlyArray<string> = [
  "apiKey",
  "api_key",
  "pat",
  "encryptedPat",
  "encrypted_pat",
  "Authorization",
  "authorization",
  "x-api-key",
  "Bearer",
  "secret",
  "token",
];

function deriveModelRef(m: AiTypeModel): string {
  if (m.apiModelId && m.apiModelId.length > 0) return m.apiModelId;
  if (m.canonicalKey && m.canonicalKey.length > 0) {
    // canonicalKey format: "provider/model-name" — strip the leading
    // provider when present so the returned ref matches what the
    // provider API actually expects.
    const slash = m.canonicalKey.indexOf("/");
    if (slash >= 0 && slash < m.canonicalKey.length - 1) {
      return m.canonicalKey.slice(slash + 1);
    }
    return m.canonicalKey;
  }
  return m.name;
}

function buildGovernance(entry: CatalogEntry | null): ProviderModelGovernanceStatus {
  if (!entry) {
    return {
      status: "unknown",
      reviewState: "unknown",
      available: false,
      reasons: ["No catalog entry registered for this model"],
    };
  }
  const available = isCatalogEntryAvailableForAppUse({
    status: entry.status,
    reviewState: entry.reviewState,
  });
  const reasons: string[] = [];
  if (entry.status !== "active") reasons.push(`status=${entry.status ?? "null"}`);
  if (entry.reviewState !== "approved") {
    reasons.push(`reviewState=${entry.reviewState ?? "null"}`);
  }
  return {
    status: entry.status ?? "unknown",
    reviewState: entry.reviewState ?? "unknown",
    available,
    reasons,
  };
}

function buildRestrictions(
  provider: Provider,
  modelEntry: CatalogEntry | null,
): ProviderModelRestrictions {
  return {
    policyTags: provider.policyTags ?? null,
    frozen: Boolean(modelEntry?.frozen ?? false),
    freezeReason: modelEntry?.freezeReason ?? null,
  };
}

function projectRow(args: {
  provider: Provider;
  model: AiTypeModel;
  modelEntry: CatalogEntry | null;
  providerEntry: CatalogEntry | null;
}): AvailableProviderModel {
  const { provider, model, modelEntry, providerEntry } = args;
  return {
    providerCatalogEntryId: providerEntry?.id ?? null,
    providerId: provider.id,
    providerSlug: model.providerSlug ?? provider.type,
    providerName: provider.name,
    providerType: provider.type,

    modelCatalogEntryId: modelEntry?.id ?? null,
    modelId: model.id,
    modelRef: deriveModelRef(model),
    modelDisplayName: model.displayName ?? null,
    capabilities: (model.capabilities ?? []) as string[],

    governanceStatus: buildGovernance(modelEntry),
    restrictions: buildRestrictions(provider, modelEntry),
  };
}

/**
 * Read-only listing of provider/model pairs available for binding.
 *
 * Returns `[]` when the database is not initialized (test sandboxes,
 * pre-boot import probes). Throws on actual query failures so the
 * caller can decide whether to degrade to "no models available" or
 * surface the error.
 */
export async function listAvailableProviderModels(
  input: ListAvailableProviderModelsInput = {},
): Promise<AvailableProviderModel[]> {
  const db = getDb();
  if (!db) return [];

  // 1. Models matching the optional providerSlug/capability filter.
  const modelConditions: any[] = [eq(aiTypeModels.status, "active")];
  if (input.providerSlug) {
    modelConditions.push(eq(aiTypeModels.providerSlug, input.providerSlug));
  }
  const modelRows: AiTypeModel[] = await db
    .select()
    .from(aiTypeModels)
    .where(and(...modelConditions));

  const filteredModels = input.capability
    ? modelRows.filter((m) =>
        Array.isArray(m.capabilities) &&
        m.capabilities.includes(input.capability!),
      )
    : modelRows;

  if (filteredModels.length === 0) return [];

  // 2. Providers referenced by those models.
  const providerIds = Array.from(
    new Set(
      filteredModels
        .map((m) => m.providerId)
        .filter((p): p is number => typeof p === "number"),
    ),
  );
  const providerRows: Provider[] =
    providerIds.length > 0
      ? await db.select().from(providers).where(inArray(providers.id, providerIds))
      : [];
  const providersById = new Map<number, Provider>(
    providerRows.map((p) => [p.id, p]),
  );

  // 3. Catalog entries for both the models and the providers.
  const modelIds = filteredModels.map((m) => m.id);
  // Canonical: catalog_entries.sourceType="ai_type_model" for rows
  // pointing at `ai_type_models.id`. Per the 2026-05-23 extension to
  // `docs/architecture/provider-model-binding/CATALOG_SOURCE_MAPPING.md`
  // (locked rule #2 — domain-row readers MUST query the new value).
  // The earlier PR #1700 alignment to `"model"` made the reader
  // consistent with the drifted writer but contradicted the spec;
  // PR #1702 extended the canonical mapping with `ai_type_model`,
  // and this PR migrates both writer + reader to the new value.
  // The migration step in `migration.ts` reconciles pre-extension
  // rows from `"model"` → `"ai_type_model"` so the inArray filter
  // here remains correct after a one-shot rename.
  const modelEntries: CatalogEntry[] = await db
    .select()
    .from(catalogEntries)
    .where(
      and(
        eq(catalogEntries.entryType, "model"),
        eq(catalogEntries.sourceType, "ai_type_model"),
        inArray(catalogEntries.sourceId, modelIds),
      ),
    );
  const modelEntryByModelId = new Map<number, CatalogEntry>();
  for (const e of modelEntries) {
    if (typeof e.sourceId === "number") modelEntryByModelId.set(e.sourceId, e);
  }

  const providerEntries: CatalogEntry[] =
    providerIds.length > 0
      ? await db
          .select()
          .from(catalogEntries)
          .where(
            and(
              eq(catalogEntries.entryType, "provider"),
              inArray(catalogEntries.providerId, providerIds),
            ),
          )
      : [];
  const providerEntryByProviderId = new Map<number, CatalogEntry>();
  for (const e of providerEntries) {
    if (typeof e.providerId === "number") {
      providerEntryByProviderId.set(e.providerId, e);
    }
  }

  // 4. Project, filter to "available" rows only.
  const projected: AvailableProviderModel[] = [];
  for (const m of filteredModels) {
    if (typeof m.providerId !== "number") continue;
    const provider = providersById.get(m.providerId);
    if (!provider) continue;
    if (provider.enabled === false) continue;

    const modelEntry = modelEntryByModelId.get(m.id) ?? null;
    const providerEntry = providerEntryByProviderId.get(m.providerId) ?? null;
    const row = projectRow({ provider, model: m, modelEntry, providerEntry });
    if (!row.governanceStatus.available) continue;
    if (row.restrictions.frozen) continue;
    projected.push(row);
  }

  return projected;
}
