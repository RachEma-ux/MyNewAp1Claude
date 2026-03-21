import { createHash } from "crypto";
import { eq, sql } from "drizzle-orm";
import { createAppBlockerError } from "../_core/blockers";
import { getActiveBundleForEntry, getCatalogEntryById } from "../db/catalog";
import { getDb } from "../db/connection";
import {
  catalogEntries,
  catalogEntryVersions,
  catalogAuditEvents,
  llms,
  llmVersions,
  type CatalogEntry,
  type LLMVersion,
} from "../../drizzle/schema";
import { hasPublishedCatalogTag } from "../../shared/catalog-execution";

export interface CatalogLLMRuntimeAuthority {
  entry: CatalogEntry;
  bundle: NonNullable<Awaited<ReturnType<typeof getActiveBundleForEntry>>>;
  sourceLLMId: number;
  sourceLLMVersionId: number;
  config: Record<string, unknown>;
}

function asPositiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getRuntimeConfig(entryConfig: unknown, bundleSnapshot: unknown): Record<string, unknown> {
  const snapshot = asRecord(bundleSnapshot);
  const snapshotConfig = asRecord(snapshot.config);
  const baseConfig = asRecord(entryConfig);
  return Object.keys(snapshotConfig).length > 0 ? snapshotConfig : baseConfig;
}

export function isLLMVersionCatalogEligible(version: Pick<LLMVersion, "callable">): boolean {
  return version.callable === true;
}

export function isRawLLMVersionRuntimeAuthority(_version: Pick<LLMVersion, "id">): boolean {
  return false;
}

export async function onboardLLMVersionToCatalogCandidate(input: {
  llmVersionId: number;
  actorId: number;
  displayName?: string;
  description?: string;
}): Promise<CatalogEntry> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  return await db.transaction(async (tx) => {
    const [version] = await tx.select().from(llmVersions).where(eq(llmVersions.id, input.llmVersionId));
    if (!version) {
      throw new Error("LLM version not found");
    }

    if (!isLLMVersionCatalogEligible(version)) {
      throw new Error("Only catalog-eligible LLM versions can be onboarded");
    }

    const [llm] = await tx.select().from(llms).where(eq(llms.id, version.llmId));
    if (!llm) {
      throw new Error("LLM not found");
    }

    // Advisory lock keyed on version ID to serialize concurrent onboarding attempts
    await (tx as any).execute(sql`SELECT pg_advisory_xact_lock(${input.llmVersionId})`);

    const existingEntries = await tx.select().from(catalogEntries).where(eq(catalogEntries.entryType, "llm"));
    const duplicate = existingEntries.find((entry) => {
      const config = asRecord(entry.config);
      return config.sourceLLMVersionId === input.llmVersionId;
    });
    if (duplicate) {
      throw new Error(`LLM version ${input.llmVersionId} is already onboarded to Catalog entry ${duplicate.id}`);
    }

    const config = {
      sourceLLMId: llm.id,
      sourceLLMVersionId: version.id,
      sourceEnvironment: version.environment,
      runtimeAuthority: "catalog_entry",
      callable: false,
      catalogEligible: true,
      callableMeaning: "catalog_candidate_runtime_disabled_until_published_and_activated",
      llmConfig: version.config,
    } satisfies Record<string, unknown>;

    const [entry] = await tx.insert(catalogEntries).values({
      name: `${llm.name}-v${version.version}`,
      displayName: input.displayName ?? `${llm.name} v${version.version}`,
      description: input.description ?? llm.description ?? `Catalog candidate for LLM version ${version.version}`,
      entryType: "llm",
      category: llm.role,
      scope: "app",
      status: "draft",
      origin: "admin",
      reviewState: "needs_review",
      config,
      tags: ["candidate", "llm"],
      createdBy: input.actorId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    const configHash = createHash("sha256").update(JSON.stringify(config)).digest("hex");
    await tx.insert(catalogEntryVersions).values({
      catalogEntryId: entry.id,
      version: 1,
      config,
      configHash,
      changeNotes: `Onboarded from LLM version ${version.id}`,
      changedBy: input.actorId,
    });

    await tx.insert(catalogAuditEvents).values({
      eventType: "catalog.llm.onboarded",
      catalogEntryId: entry.id,
      actor: input.actorId,
      actorType: "user",
      payload: {
        sourceLLMId: llm.id,
        sourceLLMVersionId: version.id,
        runtimeAuthority: "catalog_entry",
        callableMeaning: "internal_catalog_eligibility_only",
      },
      timestamp: new Date(),
    });

    return entry;
  });
}

export async function resolveCatalogLLMRuntimeAuthority(catalogEntryId: number): Promise<CatalogLLMRuntimeAuthority> {
  const entry = await getCatalogEntryById(catalogEntryId);
  if (!entry) {
    throw createAppBlockerError({
      code: "catalog_entry_missing",
      category: "dependency_block",
      title: "Catalog entry not found",
      summary: "This LLM cannot be used because the Catalog entry no longer exists.",
      context: { catalogEntryId },
    }, "NOT_FOUND");
  }

  if (entry.entryType !== "llm") {
    throw createAppBlockerError({
      code: "catalog_entry_not_llm",
      category: "validation_error",
      title: "This Catalog item is not an LLM runtime authority",
      summary: "Only Catalog LLM entries can authorize LLM runtime selection.",
      context: { catalogEntryId, entryType: entry.entryType },
    }, "BAD_REQUEST");
  }

  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  if (!hasPublishedCatalogTag(tags) || entry.reviewState !== "approved") {
    throw createAppBlockerError({
      code: "catalog_entry_not_published",
      category: "lifecycle_rule",
      title: "This LLM is not published yet",
      summary: "Catalog publication and approval are required before this LLM can become runtime-usable.",
      context: { catalogEntryId, reviewState: entry.reviewState, tags },
    }, "CONFLICT");
  }

  if (entry.status !== "active") {
    throw createAppBlockerError({
      code: "catalog_entry_inactive",
      category: "lifecycle_rule",
      title: "This LLM is not active",
      summary: "Catalog activation is required before this LLM can become runtime-usable.",
      context: { catalogEntryId, status: entry.status },
    }, "CONFLICT");
  }

  const bundle = await getActiveBundleForEntry(catalogEntryId);
  if (!bundle) {
    throw createAppBlockerError({
      code: "catalog_bundle_missing",
      category: "dependency_block",
      title: "Published runtime bundle is missing",
      summary: "This LLM does not have an active published Catalog bundle.",
      context: { catalogEntryId },
    }, "CONFLICT");
  }

  const config = getRuntimeConfig(entry.config, bundle.snapshot);
  // Accept catalogEligible (new) or callable (legacy) to avoid breaking
  // already-published entries that predate the catalogEligible flag
  if (config.catalogEligible !== true && config.callable !== true) {
    throw createAppBlockerError({
      code: "catalog_entry_not_catalog_eligible",
      category: "lifecycle_rule",
      title: "This LLM is not catalog-eligible",
      summary: "The Catalog entry is published and active, but it does not reference an internal LLM version that was approved for Catalog lifecycle use.",
      context: { catalogEntryId, catalogEligible: config.catalogEligible ?? null },
    }, "CONFLICT");
  }

  const sourceLLMVersionId = asPositiveInt(config.sourceLLMVersionId);
  const sourceLLMId = asPositiveInt(config.sourceLLMId);
  if (!sourceLLMVersionId || !sourceLLMId) {
    throw createAppBlockerError({
      code: "catalog_llm_source_missing",
      category: "validation_error",
      title: "Catalog runtime source is incomplete",
      summary: "The Catalog entry is missing the governed LLM version reference required for runtime authority.",
      context: { catalogEntryId, config },
    }, "BAD_REQUEST");
  }

  return {
    entry,
    bundle,
    sourceLLMId,
    sourceLLMVersionId,
    config,
  };
}
