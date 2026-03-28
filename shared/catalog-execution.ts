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

// ── Universal Runtime Kind ──────────────────────────────────────────────

/**
 * The runtime kind determines which execution adapter handles a catalog entry.
 *
 * - "llm-chat": traditional LLM provider streaming (requires published bundle)
 * - "service": HTTP service dispatch (requires config.runtime.kind === "service")
 */
export type CatalogRuntimeKind = "llm-chat" | "service";

/**
 * Resolve the runtime kind of a catalog entry from its config.
 * Returns "service" if the entry has service runtime metadata,
 * otherwise returns "llm-chat" (the default execution path).
 */
export function resolveCatalogRuntimeKind(
  config: Record<string, unknown> | null | undefined,
): CatalogRuntimeKind {
  if (isCatalogServiceAgent(config)) return "service";
  return "llm-chat";
}

// ── Agent Reasoning LLM Reference ────────────────────────────────────

/**
 * Extract the Default Reasoning LLM catalog entry reference from an
 * agent's config. Returns the catalog entry ID as a string, or null
 * if not configured.
 *
 * Stored at config.agent.defaultReasoningLlmRef.
 */
export function getDefaultReasoningLlmRef(
  config: Record<string, unknown> | null | undefined,
): string | null {
  if (!config) return null;
  const agent = config.agent as Record<string, unknown> | undefined;
  if (!agent) return null;
  const ref = agent.defaultReasoningLlmRef;
  return typeof ref === "string" && ref.length > 0 ? ref : null;
}
