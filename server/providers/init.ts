import { getProviderRegistry } from "./registry";
import { getAllProviders } from "./db";
import { getApprovedProviderIds } from "./catalog-guard";

/**
 * Initialize provider registry by loading all enabled providers from database.
 * CATALOG GATE: Only providers with an active+approved catalog_entry are loaded.
 * This should be called once when the server starts, AFTER syncRegistryOnStartup().
 */
export async function initializeProviders() {
  console.log("[Providers] Initializing provider registry...");

  try {
    const registry = getProviderRegistry();
    const providers = await getAllProviders();

    // Load approved provider IDs from the AI Types Catalog
    let approvedProviderIds: Set<number>;
    try {
      approvedProviderIds = await getApprovedProviderIds();
      console.log(`[Providers] Catalog gate: ${approvedProviderIds.size} approved provider(s)`);
    } catch (err: any) {
      // If catalog is unavailable, fall back to loading all enabled providers
      console.warn(`[Providers] Catalog gate unavailable (${err.message}) — loading all enabled providers`);
      approvedProviderIds = new Set(providers.map(p => p.id));
    }

    let loadedCount = 0;
    let skippedCount = 0;
    let blockedCount = 0;

    for (const provider of providers) {
      // Only load enabled providers
      if (!provider.enabled) {
        skippedCount++;
        continue;
      }

      // CATALOG GATE: only load providers with active+approved catalog entry
      if (!approvedProviderIds.has(provider.id)) {
        console.log(`[Providers] Blocked provider: ${provider.name} (id=${provider.id}) — no active catalog entry`);
        blockedCount++;
        continue;
      }

      // Parse config
      const config = typeof provider.config === 'string'
        ? JSON.parse(provider.config)
        : provider.config;

      try {
        await registry.registerProvider({
          id: provider.id,
          name: provider.name,
          type: provider.type as 'openai' | 'anthropic' | 'google' | 'groq' | 'local-ollama' | 'local-llamacpp' | 'custom',
          enabled: provider.enabled,
          priority: provider.priority ?? 50,
          createdAt: provider.createdAt,
          updatedAt: provider.updatedAt,
          config,
        });
        loadedCount++;
        console.log(`[Providers] Loaded provider: ${provider.name} (${provider.type})`);
      } catch (error) {
        console.error(`[Providers] Failed to load provider ${provider.name}:`, error);
        skippedCount++;
      }
    }

    console.log(`[Providers] Initialization complete: ${loadedCount} loaded, ${skippedCount} skipped, ${blockedCount} blocked by catalog`);
  } catch (error) {
    console.error("[Providers] Failed to initialize providers:", error);
  }
}
