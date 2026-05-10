/**
 * Graph Agent Lite — public API barrel.
 *
 * Phase 13. Sibling of `server/kgra-agent/`. Same module shape.
 */

export type {
  GraphAgentRunInput,
  GraphAgentAnswer,
  GraphAgentAnswerCitation,
} from "./contracts.js";

export {
  GraphAgentEngine,
} from "./engine.js";
export type {
  GraphAgentEngineOptions,
  ModelAccessAdapter,
  McpDispatchAdapter,
  RuntimeTraceAdapter,
} from "./engine.js";
