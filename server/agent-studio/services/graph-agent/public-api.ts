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
  GraphAgentDecisionTraceAdapter,
} from "./engine.js";
export {
  createGraphAgentDecisionTraceWriter,
  GraphAgentDecisionTraceUnavailableError,
} from "./decision-trace-writer.js";
export type { CreateGraphAgentDecisionTraceWriterOptions } from "./decision-trace-writer.js";
export { getExplanationForRun } from "./explain-reader.js";
export type {
  GraphAgentExplanation,
  GraphAgentExplanationStep,
  GetExplanationOptions,
} from "./explain-reader.js";
export { getPromptSafeSchemaSummary } from "./schema-summary.js";
export type {
  SchemaSummary,
  SchemaSummaryNodeType,
  SchemaSummaryEdgeType,
  GetSchemaSummaryOptions,
} from "./schema-summary.js";
export { exportDecisionTraceAsMarkdown } from "./trace-export.js";
export type {
  DecisionTraceMarkdown,
  ExportDecisionTraceOptions,
} from "./trace-export.js";
export { pruneRuntimeTraces } from "./retention.js";
export type {
  RetentionPruneSummary,
  PruneRuntimeTraceOptions,
} from "./retention.js";
export {
  redactSensitivePayload,
  redactExplanationSteps,
} from "./redaction.js";
export {
  exportTraceToNote,
  AsdbUnavailableError as TraceNoteWriterAsdbUnavailableError,
  TraceNoteAlreadyExistsError,
} from "./trace-note-writer.js";
export type {
  ExportTraceToNoteInput,
  ExportTraceToNoteResult,
  ExportTraceToNoteOptions,
} from "./trace-note-writer.js";
