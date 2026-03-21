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

export function isCatalogExecutionEligible(entry: CatalogExecutionEntryLike): boolean {
  return (
    entry.entryType === "agent" &&
    entry.status === "active" &&
    entry.reviewState === "approved" &&
    hasPublishedCatalogTag(entry.tags) &&
    isCatalogEntryCallable(entry.config)
  );
}
