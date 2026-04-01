/**
 * BACKWARD COMPATIBILITY SHIM
 * Canonical code now lives in server/ai-types/service-runtime.ts
 */
export {
  isServiceBasedAgent,
  resolveServiceAgent,
  resolveServiceAgentByName,
  checkServiceHealth,
  checkServiceHealthByName,
  type ServiceRuntimeConfig,
  type ServiceRuntimeTarget,
  type ServiceHealthResult,
} from "../ai-types/service-runtime";
