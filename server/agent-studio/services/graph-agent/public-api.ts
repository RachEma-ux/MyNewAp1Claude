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
export { getGraphSkillSourceNoteRefsForRun } from "./graph-skill-source-note-refs-reader.js";
export type {
  GraphSkillSourceNoteRef,
  GetGraphSkillSourceNoteRefsOptions,
} from "./graph-skill-source-note-refs-reader.js";
export { getCagSourceNoteRefsForRun } from "./cag-source-note-refs-reader.js";
export type {
  CagSourceNoteRef,
  GetCagSourceNoteRefsOptions,
} from "./cag-source-note-refs-reader.js";
export {
  recordTraceProjectionIntent,
  listPendingProjectionEvents,
  markEventApplied,
  markEventFailed,
  AsdbUnavailableError as ProjectionEventsAsdbUnavailableError,
  ProjectionEventNotFoundError,
} from "./projection-events.js";
export type {
  RuntimeGraphEvent,
  RuntimeGraphEventKind,
  RecordTraceProjectionIntentInput,
  ListPendingProjectionEventsInput,
  ProjectionEventsOptions,
} from "./projection-events.js";
export {
  translateRuntimeGraphEvent,
  translateRuntimeTraceIntent,
  translateDecisionTraceIntent,
} from "./projection-event-translator.js";
export {
  expandDecisionTraceSteps,
  loadDecisionTraceStepsForRun,
} from "./projection-step-expander.js";
export type {
  DecisionTraceStepRow,
  LoadDecisionTraceStepsOptions,
} from "./projection-step-expander.js";
export {
  expandRuntimeSkillPackEdges,
  loadRuntimeSkillPackUsagesForRun,
} from "./projection-skill-pack-expander.js";
export type {
  RuntimeSkillPackUsageRow,
  LoadRuntimeSkillPackUsagesOptions,
} from "./projection-skill-pack-expander.js";
export {
  expandRuntimeNoteVersionEdges,
  loadRuntimeNoteReferencesForRun,
} from "./projection-note-version-expander.js";
export type {
  RuntimeNoteReferenceRow,
  LoadRuntimeNoteReferencesOptions,
} from "./projection-note-version-expander.js";
export {
  expandRuntimeCagBlockEdges,
  loadRuntimeCagBlockUsagesForRun,
} from "./projection-cag-block-expander.js";
export type {
  RuntimeCagBlockUsageRow,
  LoadRuntimeCagBlockUsagesOptions,
} from "./projection-cag-block-expander.js";
export { buildProjectionWritesForEvent } from "./projection-drain.js";
export type {
  ProjectionDrainLoaders,
  BuildProjectionWritesOptions,
} from "./projection-drain.js";

export {
  enrichWithGraphProvenance,
  enrichPathWithGraphProvenance,
  countHiddenInProvenance,
  isVisibleProvenance,
} from "./provenance-enricher.js";
export type {
  NodeProvenanceEnvelope,
  PathProvenanceEnvelope,
} from "./provenance-enricher.js";
