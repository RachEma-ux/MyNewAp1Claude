/**
 * BACKWARD COMPATIBILITY SHIM
 * Canonical code now lives in server/ai-types/execution.ts
 * This re-exports everything so existing imports continue to work.
 */
export {
  resolveCatalogAgentExecutionTarget,
  resolveServiceAgentExecutionTarget,
  executeCatalogChatStream,
  executeServiceAgentStream,
  getExecutionRunForUi,
  catalogExecutionQuerySchema,
  type CatalogAgentExecutionTarget,
  type ServiceAgentExecutionTarget,
  type CatalogExecutionEvent,
  type ReasoningLlmContext,
} from "../ai-types/execution";
