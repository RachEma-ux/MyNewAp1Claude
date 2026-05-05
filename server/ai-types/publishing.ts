/**
 * AI Types Catalog Publishing Service
 *
 * Module-owned business logic for `aiTypes.catalog.publish`. Builds
 * an immutable snapshot of a catalog entry, supersedes any prior
 * active publish bundle, inserts the new bundle, flips the entry's
 * status to "published", and records a catalog audit event.
 *
 * Used both by the gateway public-API (`aiTypes.catalog.publish`,
 * receipt-required) and by future internal callers that need the
 * same publish semantics. Everything stays inside the AI Types
 * module — DB writes go through `./db` helpers and the audit row.
 */

import { createHash } from "crypto";
import {
  getCatalogEntryById,
  getPublishBundles,
  createPublishBundle,
  createCatalogAuditEvent,
  updateCatalogEntry,
} from "./db";
import { deriveSourceModule } from "./register";
import {
  AI_TYPES_EVENTS,
  type CatalogPublishedPayload,
} from "./events";
import { makeEnvelope, publishEvent } from "../platform/events";
import type { PublishBundle } from "../../drizzle/schema";

export interface PublishCatalogEntryInput {
  catalogEntryId: number;
  publishedBy: number;
  versionLabel?: string;
  policyDecision?: string;
}

export interface PublishCatalogEntryResult {
  bundle: PublishBundle;
  versionLabel: string;
}

/**
 * Publish a catalog entry as a new immutable bundle. Throws if the
 * entry does not exist.
 *
 * If `versionLabel` is omitted, generates `v{N}` where N is one
 * greater than the count of existing bundles for the entry.
 */
export async function publishCatalogEntry(
  input: PublishCatalogEntryInput,
): Promise<PublishCatalogEntryResult> {
  const entry = await getCatalogEntryById(input.catalogEntryId);
  if (!entry) {
    throw new Error(`Catalog entry ${input.catalogEntryId} not found`);
  }

  const existing = await getPublishBundles({
    catalogEntryId: input.catalogEntryId,
  });
  const versionLabel = input.versionLabel ?? `v${existing.length + 1}`;

  const snapshot = {
    id: entry.id,
    name: entry.name,
    displayName: entry.displayName,
    description: entry.description,
    entryType: entry.entryType,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    category: entry.category,
    subCategory: entry.subCategory,
    capabilities: entry.capabilities,
    scope: entry.scope,
    origin: entry.origin,
    providerId: entry.providerId,
    config: entry.config ?? {},
    tags: entry.tags ?? [],
    publishedAt: new Date().toISOString(),
  };
  const snapshotHash = createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");

  const bundle = await createPublishBundle({
    catalogEntryId: input.catalogEntryId,
    versionLabel,
    snapshot,
    snapshotHash,
    publishedBy: input.publishedBy,
    policyDecision: input.policyDecision,
  });

  if (entry.status !== "published") {
    await updateCatalogEntry(
      input.catalogEntryId,
      { status: "published" },
      input.publishedBy,
    );
  }

  await createCatalogAuditEvent({
    eventType: "catalog.publish",
    catalogEntryId: input.catalogEntryId,
    publishBundleId: bundle.id,
    actor: input.publishedBy,
    actorType: "user",
    payload: { versionLabel, snapshotHash },
  });

  // Direction B B2b — emit `aiTypes.catalog.published` after the DB writes
  // succeed. Best-effort: bus failures must NOT roll back the publish.
  // Decision doc: docs/architecture/ai-types/CATALOG_LIFECYCLE_EVENT_DECISION.md
  const publishedPayload: CatalogPublishedPayload = {
    catalogEntryId: input.catalogEntryId,
    publishBundleId: bundle.id,
    versionLabel,
    sourceModule: deriveSourceModule(entry.sourceType ?? ""),
    sourceRefId: entry.sourceId ?? null,
    performedByActorId: input.publishedBy,
    performedByActorType: "user",
    workspaceId: null,
    publishedAt: new Date().toISOString(),
  };
  try {
    await publishEvent(
      makeEnvelope({
        eventType: AI_TYPES_EVENTS.catalogPublished,
        sourceModule: "aiTypes",
        workspaceId: null,
        actorId: input.publishedBy,
        payload: publishedPayload,
      }),
    );
  } catch (err) {
    console.warn(
      `[publishing] event '${AI_TYPES_EVENTS.catalogPublished}' failed for entry ${input.catalogEntryId}:`,
      err instanceof Error ? err.message : err,
    );
  }

  return { bundle, versionLabel };
}
