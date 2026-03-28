/**
 * Catalog Service-Runtime Resolver
 *
 * Resolves catalog agent entries with runtime.kind === "service" into
 * concrete service targets. This is the bounded runtime integration
 * for service-based agents (e.g., Project Context Translator).
 *
 * Unlike the LLM-chat execution path in execution.ts (which requires
 * publish bundles, source agents, and provider resolution), service-based
 * agents are dispatched directly to their dedicated HTTP service endpoints.
 *
 * Boundaries:
 *   - Only resolves entries with runtime.kind === "service"
 *   - Only dispatches to known service endpoints (health, status, translate)
 *   - No arbitrary code execution
 *   - No arbitrary shell execution
 *   - No filesystem access from request payload
 */

import { getCatalogEntries, getCatalogEntryById } from "../db/catalog";

// ── Types ─────────────────────────────────────────────────────────────────

export interface ServiceRuntimeConfig {
  kind: "service";
  serviceKind: string;
  serviceName: string;
  serviceUrlEnv: string;
  serviceUrlDefault: string;
  healthEndpoint: string;
  statusEndpoint?: string;
  translateEndpoint: string;
  inputSchemaRef?: string;
  outputSchemaRef?: string;
  capabilityTags?: string[];
  bounded: boolean;
}

export interface ServiceRuntimeTarget {
  catalogEntryId: number;
  catalogEntryName: string;
  displayName: string;
  serviceUrl: string;
  healthUrl: string;
  statusUrl: string | null;
  translateUrl: string;
  serviceName: string;
  serviceKind: string;
  capabilityTags: string[];
}

export interface ServiceHealthResult {
  available: boolean;
  status: string;
  service: string;
  version: string;
  llmProvider?: string;
  llmModel?: string;
  promptLoaded?: boolean;
  error?: string;
  latencyMs: number;
}

// ── Resolver ──────────────────────────────────────────────────────────────

/**
 * Extract ServiceRuntimeConfig from a catalog entry's config JSON.
 * Returns null if the entry doesn't have service runtime metadata.
 */
function extractServiceRuntime(config: Record<string, unknown> | null | undefined): ServiceRuntimeConfig | null {
  if (!config) return null;
  const runtime = config.runtime as Record<string, unknown> | undefined;
  if (!runtime || runtime.kind !== "service") return null;

  return {
    kind: "service",
    serviceKind: String(runtime.serviceKind || "unknown"),
    serviceName: String(runtime.serviceName || "unknown"),
    serviceUrlEnv: String(runtime.serviceUrlEnv || ""),
    serviceUrlDefault: String(runtime.serviceUrlDefault || "http://localhost:8585"),
    healthEndpoint: String(runtime.healthEndpoint || "/health"),
    statusEndpoint: runtime.statusEndpoint ? String(runtime.statusEndpoint) : undefined,
    translateEndpoint: String(runtime.translateEndpoint || "/translate"),
    inputSchemaRef: runtime.inputSchemaRef ? String(runtime.inputSchemaRef) : undefined,
    outputSchemaRef: runtime.outputSchemaRef ? String(runtime.outputSchemaRef) : undefined,
    capabilityTags: Array.isArray(runtime.capabilityTags) ? runtime.capabilityTags.map(String) : [],
    bounded: runtime.bounded === true,
  };
}

/**
 * Resolve a catalog entry by name into a ServiceRuntimeTarget.
 * Returns null if the entry doesn't exist or isn't a service-based agent.
 */
export async function resolveServiceAgentByName(catalogName: string): Promise<ServiceRuntimeTarget | null> {
  const entries = await getCatalogEntries({ entryType: "agent" });
  const entry = entries.find(e => e.name === catalogName);
  if (!entry) return null;
  return resolveServiceAgent(entry.id);
}

/**
 * Resolve a catalog entry by ID into a ServiceRuntimeTarget.
 * Returns null if the entry doesn't exist or isn't a service-based agent.
 */
export async function resolveServiceAgent(catalogEntryId: number): Promise<ServiceRuntimeTarget | null> {
  const entry = await getCatalogEntryById(catalogEntryId);
  if (!entry) return null;
  if (entry.entryType !== "agent") return null;

  const runtime = extractServiceRuntime(entry.config as Record<string, unknown>);
  if (!runtime) return null;

  // Resolve the service URL from environment or default
  const serviceUrl = (runtime.serviceUrlEnv ? process.env[runtime.serviceUrlEnv] : null)
    || runtime.serviceUrlDefault;

  return {
    catalogEntryId: entry.id,
    catalogEntryName: entry.name,
    displayName: entry.displayName || entry.name,
    serviceUrl,
    healthUrl: `${serviceUrl}${runtime.healthEndpoint}`,
    statusUrl: runtime.statusEndpoint ? `${serviceUrl}${runtime.statusEndpoint}` : null,
    translateUrl: `${serviceUrl}${runtime.translateEndpoint}`,
    serviceName: runtime.serviceName,
    serviceKind: runtime.serviceKind,
    capabilityTags: runtime.capabilityTags || [],
  };
}

// ── Health Check ──────────────────────────────────────────────────────────

/**
 * Check the health of a service-based agent by its catalog entry ID.
 * Returns a structured result with availability status and latency.
 */
export async function checkServiceHealth(catalogEntryId: number): Promise<ServiceHealthResult> {
  const target = await resolveServiceAgent(catalogEntryId);
  if (!target) {
    return {
      available: false,
      status: "not_resolved",
      service: "unknown",
      version: "unknown",
      error: "Catalog entry not found or not a service-based agent",
      latencyMs: 0,
    };
  }

  return checkServiceHealthByUrl(target.healthUrl);
}

/**
 * Check the health of a service-based agent by its catalog name.
 */
export async function checkServiceHealthByName(catalogName: string): Promise<ServiceHealthResult> {
  const target = await resolveServiceAgentByName(catalogName);
  if (!target) {
    return {
      available: false,
      status: "not_resolved",
      service: "unknown",
      version: "unknown",
      error: `Catalog entry "${catalogName}" not found or not a service-based agent`,
      latencyMs: 0,
    };
  }

  return checkServiceHealthByUrl(target.healthUrl);
}

/**
 * Check health of a service at a specific URL.
 */
async function checkServiceHealthByUrl(healthUrl: string): Promise<ServiceHealthResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(healthUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    if (!resp.ok) {
      return {
        available: false,
        status: "unhealthy",
        service: "unknown",
        version: "unknown",
        error: `Health check returned ${resp.status} ${resp.statusText}`,
        latencyMs,
      };
    }

    const data = await resp.json();
    return {
      available: true,
      status: data.status || "ok",
      service: data.service || "unknown",
      version: data.version || "unknown",
      llmProvider: data.llmProvider,
      llmModel: data.llmModel,
      promptLoaded: data.promptLoaded,
      latencyMs,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const isTimeout = err.name === "AbortError";
    return {
      available: false,
      status: "unavailable",
      service: "unknown",
      version: "unknown",
      error: isTimeout
        ? "Health check timed out (5s)"
        : `Service unreachable: ${err.message || "unknown error"}`,
      latencyMs,
    };
  }
}

/**
 * Check if a catalog entry is a service-based agent (has runtime.kind === "service").
 */
export function isServiceBasedAgent(config: Record<string, unknown> | null | undefined): boolean {
  return extractServiceRuntime(config) !== null;
}
