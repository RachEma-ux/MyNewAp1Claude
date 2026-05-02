/**
 * OpenRouter — Public contract.
 *
 * Other modules import from `@/modules/openrouter` only.
 */

export type { OpenRouterView } from "./types";

export const OpenRouterRoutes = {
  root: () => "/openrouter",
  connect: () => "/openrouter/connect",
  models: () => "/openrouter/models",
  routing: () => "/openrouter/routing",
  guardrails: () => "/openrouter/guardrails",
  playground: () => "/openrouter/playground",
  usage: () => "/openrouter/usage",
  health: () => "/openrouter/health",
  activity: () => "/openrouter/activity",
} as const;
