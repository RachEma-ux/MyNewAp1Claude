/**
 * OpenRouter — Event types
 */
export const OPEN_ROUTER_EVENTS = {
  routingConfigUpdated: "openRouter.routing.config.updated",
} as const;

export type OpenRouterEventType =
  (typeof OPEN_ROUTER_EVENTS)[keyof typeof OPEN_ROUTER_EVENTS];
