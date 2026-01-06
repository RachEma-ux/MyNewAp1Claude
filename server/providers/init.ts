import { getProviderRegistry } from "./registry";
import { getAllProviders } from "./db";

/**
 * Initialize provider registry by loading all enabled providers from database
 * This should be called once when the server starts
 */
export async function initializeProviders() {
  console.log("[Providers] Initializing provider registry...");
  
  try {
    const registry = getProviderRegistry();
    const providers = await getAllProviders();
    
    let loadedCount = 0;
    let skippedCount = 0;
    
    for (const provider of providers) {
      // Only load enabled providers
      if (!provider.enabled) {
        skippedCount++;
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
          type: provider.type as 'openai' | 'anthropic' | 'google',
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
    
    console.log(`[Providers] Initialization complete: ${loadedCount} loaded, ${skippedCount} skipped`);
  } catch (error) {
    console.error("[Providers] Failed to initialize providers:", error);
  }
}
