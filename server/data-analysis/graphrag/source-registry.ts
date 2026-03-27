/**
 * GraphRAG Source Registry
 *
 * Manages source adapter registration and lookup.
 * Each adapter is bound to exactly one (moduleSlug, datasetKey) pair.
 * No adapter may proxy or access another module's data.
 */

import type { GraphRagSourceAdapter } from "./types";

const adapterRegistry = new Map<string, GraphRagSourceAdapter>();

function makeKey(moduleSlug: string, datasetKey: string): string {
  return `${moduleSlug}:${datasetKey}`;
}

/**
 * Register a source adapter. Throws if the key is already registered.
 */
export function registerSourceAdapter(adapter: GraphRagSourceAdapter): void {
  const key = makeKey(adapter.moduleSlug, adapter.datasetKey);
  if (adapterRegistry.has(key)) {
    throw new Error(
      `GraphRAG source adapter already registered: ${key}`
    );
  }
  adapterRegistry.set(key, adapter);
  console.log(`[GraphRAG] Source adapter registered: ${key}`);
}

/**
 * Get a registered adapter. Returns undefined if not found.
 */
export function getSourceAdapter(
  moduleSlug: string,
  datasetKey: string
): GraphRagSourceAdapter | undefined {
  return adapterRegistry.get(makeKey(moduleSlug, datasetKey));
}

/**
 * List all registered adapters.
 */
export function listSourceAdapters(): GraphRagSourceAdapter[] {
  return Array.from(adapterRegistry.values());
}

/**
 * Validate that a request targets only one module's data.
 * Rejects cross-module access attempts.
 */
export function validateModuleScope(
  requestModuleSlug: string,
  adapterModuleSlug: string
): void {
  if (requestModuleSlug !== adapterModuleSlug) {
    throw new Error(
      `GraphRAG isolation violation: request for module "${requestModuleSlug}" ` +
        `cannot access adapter for module "${adapterModuleSlug}"`
    );
  }
}
