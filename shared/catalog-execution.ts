import { z } from "zod";

export interface CatalogExecutionEntryLike {
  entryType: string;
  status: string;
  reviewState: string;
  tags?: string[] | null;
  config?: Record<string, unknown> | null;
}

export const catalogAgentExecutionConfigSchema = z.object({
  sourceAgentId: z.number().int().positive(),
  roleClass: z.string().trim().min(1),
  systemPrompt: z.string().trim().min(1),
  modelId: z.string().trim().min(1),
  temperature: z.coerce.number().min(0).max(2),
  hasDocumentAccess: z.boolean(),
  hasToolAccess: z.boolean(),
  allowedTools: z.array(z.string()),
  callable: z.literal(true),
});

export type CatalogAgentExecutionConfig = z.infer<typeof catalogAgentExecutionConfigSchema>;

export function hasPublishedCatalogTag(tags: string[] | null | undefined): boolean {
  return Array.isArray(tags) && tags.includes("published");
}

export function isCatalogEntryCallable(config: Record<string, unknown> | null | undefined): boolean {
  return config?.callable === true;
}

/**
 * Check if a catalog entry config indicates a service-backed agent.
 * Service agents have config.runtime.kind === "service".
 */
export function isCatalogServiceAgent(config: Record<string, unknown> | null | undefined): boolean {
  if (!config) return false;
  const runtime = config.runtime as Record<string, unknown> | undefined;
  return runtime?.kind === "service";
}

/**
 * Check if a catalog entry is eligible for LLM-chat execution.
 * This is the traditional execution path requiring published bundles.
 */
export function isCatalogExecutionEligible(entry: CatalogExecutionEntryLike): boolean {
  return (
    entry.entryType === "agent" &&
    entry.status === "active" &&
    entry.reviewState === "approved" &&
    hasPublishedCatalogTag(entry.tags) &&
    isCatalogEntryCallable(entry.config)
  );
}

/**
 * Check if a catalog entry is eligible for service-backed execution.
 * Service agents only need to be active agents with runtime metadata.
 */
export function isCatalogServiceExecutionEligible(entry: CatalogExecutionEntryLike): boolean {
  return (
    entry.entryType === "agent" &&
    entry.status === "active" &&
    isCatalogServiceAgent(entry.config)
  );
}
