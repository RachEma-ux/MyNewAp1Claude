/**
 * AI Types — Public contract.
 *
 * Other modules import from `@/modules/ai-types` only.
 */

export type { AITypesView, AITypesCatalogKind } from "./types";

export const AITypesRoutes = {
  root: () => "/ai-types",
  overview: () => "/ai-types/overview",
  catalog: () => "/ai-types/catalog",
  providers: () => "/ai-types/providers",
  llms: () => "/ai-types/llms",
  models: () => "/ai-types/models",
  agents: () => "/ai-types/agents",
  bots: () => "/ai-types/bots",
  taxonomy: () => "/ai-types/taxonomy",
  relationships: () => "/ai-types/relationships",
  validation: () => "/ai-types/validation",
  governance: () => "/ai-types/governance",
  controlPanel: () => "/ai-types/control-panel",
} as const;
