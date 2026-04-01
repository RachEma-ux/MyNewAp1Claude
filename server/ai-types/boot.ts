/**
 * AI Types Module — Boot Wiring
 *
 * Called once at server startup to wire real implementations
 * into the AI Types port interfaces. After this runs, the
 * AI Types module can call providers, agents, and governance
 * through its ports without importing them directly.
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

/**
 * Initialize the AI Types module by wiring external dependencies.
 * Must be called before any catalog execution or governance operation.
 */
export function bootAiTypesModule() {
  // Lazy imports — these modules may not be loaded yet at import time
  const providerPort: ICatalogProviderPort = {
    getRegistry() {
      // Lazy-require to avoid circular dependency at module load time
      const { getProviderRegistry } = require("../providers/registry");
      return getProviderRegistry();
    },
  };

  const agentPort: ICatalogAgentPort = {
    async getAgent(agentId: number) {
      const { getAgent } = require("../agents/db");
      return getAgent(agentId);
    },
  };

  const governancePort: ICatalogGovernancePort = {
    async evaluateStageReview(entryId, stage, context) {
      const { evaluateStageReview } = require("../governance/stage-review");
      return evaluateStageReview(entryId, stage, context);
    },
  };

  const providerDbPort: ICatalogProviderDbPort = {
    async getAllProviders() {
      const providerDb = require("../providers/db");
      return providerDb.getAllProviders();
    },
    async getProviderById(id: number) {
      const providerDb = require("../providers/db");
      const all = await providerDb.getAllProviders();
      return all.find((p: any) => p.id === id) ?? null;
    },
  };

  setProviderPort(providerPort);
  setAgentPort(agentPort);
  setGovernancePort(governancePort);
  setProviderDbPort(providerDbPort);

  console.log("[AI Types] Module ports wired successfully");
}
