import { createAppBlockerError } from "../_core/blockers";
import { getCatalogEntryById, getActiveBundleForEntry } from "../db/catalog";
import { getAgent } from "../agents/db";
import {
  catalogAgentExecutionConfigSchema,
  hasPublishedCatalogTag,
  isCatalogEntryCallable,
  type CatalogAgentExecutionConfig,
} from "@shared/catalog-execution";

export interface CatalogAgentExecutionTarget {
  entry: Awaited<ReturnType<typeof getCatalogEntryById>> extends infer T ? Exclude<T, null> : never;
  bundle: NonNullable<Awaited<ReturnType<typeof getActiveBundleForEntry>>>;
  executionConfig: CatalogAgentExecutionConfig;
  sourceAgent: NonNullable<Awaited<ReturnType<typeof getAgent>>>;
}

export async function resolveCatalogAgentExecutionTarget(catalogEntryId: number): Promise<CatalogAgentExecutionTarget> {
  const entry = await getCatalogEntryById(catalogEntryId);
  if (!entry) {
    throw createAppBlockerError({
      code: "catalog_entry_missing",
      category: "dependency_block",
      title: "Catalog entry not found",
      summary: "This run cannot start because the selected Catalog entry no longer exists.",
      recommendedActions: [
        "Refresh the Catalog and select an entry that still exists.",
      ],
      context: { catalogEntryId },
    }, "NOT_FOUND");
  }

  if (entry.entryType !== "agent") {
    throw createAppBlockerError({
      code: "catalog_entry_not_agent",
      category: "validation_error",
      title: "This Catalog item cannot be run here",
      summary: "Only Catalog agent entries can be launched from the agent runtime.",
      details: [
        `Entry type: ${entry.entryType}`,
      ],
      recommendedActions: [
        "Open an agent entry instead, or use the workflow intended for this Catalog type.",
      ],
      context: { catalogEntryId, entryType: entry.entryType },
    }, "BAD_REQUEST");
  }

  const tags = Array.isArray(entry.tags) ? entry.tags : [];

  if (!hasPublishedCatalogTag(tags) || entry.reviewState !== "approved") {
    throw createAppBlockerError({
      code: "catalog_entry_not_published",
      category: "lifecycle_rule",
      title: "This agent is not published yet",
      summary: "This Catalog entry cannot run until it completes the full publish flow.",
      missingRequirements: [
        "Published Catalog status",
        "Approved publish-stage review",
      ],
      details: [
        `Current review state: ${entry.reviewState}`,
        `Published tag present: ${hasPublishedCatalogTag(tags) ? "yes" : "no"}`,
      ],
      recommendedActions: [
        "Finish the remaining Catalog review and publication steps, then try again.",
      ],
      context: { catalogEntryId, reviewState: entry.reviewState, tags },
    }, "CONFLICT");
  }

  if (entry.status !== "active") {
    throw createAppBlockerError({
      code: "catalog_entry_inactive",
      category: "lifecycle_rule",
      title: "This agent is not active",
      summary: "This Catalog entry cannot run because it is not currently active.",
      details: [
        `Current status: ${entry.status}`,
      ],
      recommendedActions: [
        "Activate the published Catalog entry, then try again.",
      ],
      context: { catalogEntryId, status: entry.status },
    }, "CONFLICT");
  }

  const bundle = await getActiveBundleForEntry(catalogEntryId);
  if (!bundle) {
    throw createAppBlockerError({
      code: "catalog_bundle_missing",
      category: "dependency_block",
      title: "Published runtime bundle is missing",
      summary: "This Catalog entry cannot run because it does not have an active published bundle.",
      recommendedActions: [
        "Publish the entry again so the runtime has an active bundle to execute.",
      ],
      context: { catalogEntryId },
    }, "CONFLICT");
  }

  const snapshot = bundle.snapshot as Record<string, unknown> | null;
  const config = (snapshot?.config as Record<string, unknown> | null) ?? entry.config ?? null;

  if (!isCatalogEntryCallable(config)) {
    throw createAppBlockerError({
      code: "catalog_entry_not_callable",
      category: "lifecycle_rule",
      title: "This agent is not enabled for runtime calls",
      summary: "This Catalog entry is published, but runtime calling is turned off for it.",
      recommendedActions: [
        "Enable runtime calling in the published Catalog configuration, then publish the updated entry.",
      ],
      context: { catalogEntryId, callable: config?.callable ?? null },
    }, "CONFLICT");
  }

  const parsed = catalogAgentExecutionConfigSchema.safeParse(config ?? {});
  if (!parsed.success) {
    throw createAppBlockerError({
      code: "catalog_execution_config_invalid",
      category: "validation_error",
      title: "This agent is missing runtime configuration",
      summary: "This Catalog entry cannot run because its published runtime configuration is incomplete or invalid.",
      fieldIssues: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "config",
        issue: issue.code,
        message: issue.message,
      })),
      missingRequirements: parsed.error.issues.map((issue) => issue.path.join(".") || "config"),
      recommendedActions: [
        "Fix the Catalog execution settings, publish a new version, then try again.",
      ],
      context: { catalogEntryId, bundleId: bundle.id },
      technicalDetails: parsed.error.message,
    }, "BAD_REQUEST");
  }

  const sourceAgent = await getAgent(parsed.data.sourceAgentId);
  if (!sourceAgent) {
    throw createAppBlockerError({
      code: "catalog_source_agent_missing",
      category: "dependency_block",
      title: "Source agent definition is missing",
      summary: "This Catalog entry cannot run because its source agent definition is no longer available.",
      recommendedActions: [
        "Restore the source agent or republish the Catalog entry from a valid agent definition.",
      ],
      context: { catalogEntryId, sourceAgentId: parsed.data.sourceAgentId },
    }, "NOT_FOUND");
  }

  return {
    entry,
    bundle,
    executionConfig: parsed.data,
    sourceAgent,
  };
}
