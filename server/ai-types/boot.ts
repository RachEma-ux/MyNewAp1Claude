/**
 * AI Types Module — Boot Wiring
 *
 * Called once at server startup to wire real implementations
 * into the AI Types port interfaces. After this runs, the
 * AI Types module can call providers, agents, and governance
 * through its ports without importing them directly.
 *
 * Uses dynamic import() instead of require() for ESM compatibility
 * with the tsx runtime. All port methods are called lazily at
 * execution time, not at boot time, so circular deps are avoided.
 */

import {
  setProviderPort,
  setAgentPort,
  setGovernancePort,
  setProviderDbPort,
  type ICatalogProviderPort,
  type ICatalogAgentPort,
  type ICatalogGovernancePort,
  type ICatalogProviderDbPort,
} from "./ports";

// Cached module references — populated by async pre-load at boot,
// used synchronously at execution time (always resolved by then).
let _registryMod: any = null;

/**
 * Initialize the AI Types module by wiring external dependencies.
 * Must be called before any catalog execution or governance operation.
 */
export function bootAiTypesModule() {
  // Pre-load the provider registry module. By the time any user
  // triggers catalog execution, this import will have resolved.
  import("../providers/registry").then((mod) => {
    _registryMod = mod;
  });

  const providerPort: ICatalogProviderPort = {
    getRegistry() {
      if (!_registryMod) {
        throw new Error("[AI Types] Provider registry not yet loaded.");
      }
      return _registryMod.getProviderRegistry();
    },
  };

  const agentPort: ICatalogAgentPort = {
    async getAgent(agentId: number) {
      const mod = await import("../agents/db");
      return mod.getAgent(agentId);
    },
  };

  const governancePort: ICatalogGovernancePort = {
    async evaluateStageReview(entryId, stage, context) {
      const mod = await import("../governance/stage-review");
      return mod.evaluateStageReview(entryId, stage, context);
    },
  };

  const providerDbPort: ICatalogProviderDbPort = {
    async getAllProviders() {
      const mod = await import("../providers/db");
      return mod.getAllProviders();
    },
    async getProviderById(id: number) {
      const mod = await import("../providers/db");
      const all = await mod.getAllProviders();
      return all.find((p: any) => p.id === id) ?? null;
    },
  };

  setProviderPort(providerPort);
  setAgentPort(agentPort);
  setGovernancePort(governancePort);
  setProviderDbPort(providerDbPort);

  console.log("[AI Types] Module ports wired successfully");
}
