/**
 * OpenRouter — Provided ports.
 */
import type { OpenRouterRouteRequest } from "./contracts";

export interface OpenRouterRoutePort {
  route(req: OpenRouterRouteRequest): Promise<{ provider: string; modelId: string }>;
}
