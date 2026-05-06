/**
 * Universal Ingestion — public barrel.
 *
 * Re-exports the public surface that callers (tRPC routers, tests,
 * future feature modules) consume. The internal services and the
 * registries are exported for tests and for boot-time custom
 * registration; the principal entry point for production code is
 * `runIngestion` from `universal-ingestion-service.ts`.
 */

// Types + contracts
export type {
  RawArtifact,
  ParsedDocument,
  ParsedPart,
  NormalizedKnowledgeUnitInput,
  NormalizedKnowledgeUnitType,
  SourceConnector,
  SourceConnectorInput,
  Parser,
  Normalizer,
  NormalizerInput,
  Extractor,
  ExtractorInput,
  ExtractionOutput,
  IngestionJobRequest,
  IngestionJobResult,
  DataValidationFinding,
  DataValidationResult,
} from "./types";

export {
  KnowledgeUnitContractError,
  UnsupportedContentTypeError,
} from "./types";

// Top-level orchestrator
export { runIngestion } from "./universal-ingestion-service";

// Registries (mostly for test-time registration)
export {
  registerSourceConnector,
  registerDefaultSourceConnectors,
  resetSourceConnectorsToDefaults,
  getSourceConnector,
  listSourceConnectors,
  inlineBufferConnector,
} from "./source-connector-registry";

export {
  registerParser,
  registerDefaultParsers,
  resetParsersToDefaults,
  getParser,
  listParsers,
  selectParserForContentType,
} from "./parser-registry";

export {
  registerNormalizer,
  registerDefaultNormalizers,
  resetNormalizersToDefaults,
  getNormalizer,
  listNormalizers,
  identityNormalizer,
} from "./normalizer-registry";

export {
  registerExtractor,
  getExtractor,
  listExtractors,
} from "./extractor-registry";

// Direct service entry points (for callers that don't go through
// `runIngestion`)
export {
  insertUnit,
  archiveUnit,
} from "./knowledge-unit-service";

export {
  recordProvenance,
  getProvenance,
} from "./provenance-service";

export {
  validateUnit,
  registerValidationRule,
  clearValidationRules,
  VALIDATOR_VERSION,
} from "./data-validation-service";
export type { ValidationRule } from "./data-validation-service";

export {
  startJob,
  completeJob,
  getJob,
} from "./ingestion-job-service";

// Parsers (re-exported so callers can register subsets in tests)
export { textParser } from "./parsers/text-parser";
export { markdownParser } from "./parsers/markdown-parser";
export { htmlSnapshotParser } from "./parsers/html-snapshot-parser";
export { jsonParser } from "./parsers/json-parser";
export { basicPdfTextParser } from "./parsers/basic-pdf-parser";
export { basicCodeFileParser } from "./parsers/basic-code-parser";
export { csvParser } from "./parsers/csv-parser";
export { xlsxParser } from "./parsers/xlsx-parser";
export { ocrParser, createOcrParser } from "./parsers/ocr-parser";
export type { OcrParserDeps } from "./parsers/ocr-parser";
