/**
 * Graph Quality — public API barrel.
 *
 * Phase 23 §1. Exposes the scan orchestrator + registered scanners.
 */

export {
  runQualityScan,
  UnknownScanKindError,
} from "./scan-orchestrator.js";
export type {
  QualityFinding,
  QualityScanSample,
  QualityScanner,
  QualityScannerRegistration,
  RunQualityScanInput,
  RunQualityScanOptions,
  RunQualityScanResult,
} from "./scan-orchestrator.js";

export {
  scanForOrphanNodes,
  orphanNodeScanner,
} from "./scanners/orphan-node-scanner.js";

import { orphanNodeScanner } from "./scanners/orphan-node-scanner.js";
import type { QualityScannerRegistration } from "./scan-orchestrator.js";

/**
 * Canonical registry: every scanner the orchestrator can dispatch on.
 * Additional scanners (duplicate_entity, missing_property, stale_node,
 * projection_drift, ...) extend this list in follow-up PRs.
 */
export const QUALITY_SCANNER_REGISTRY: readonly QualityScannerRegistration[] = [
  orphanNodeScanner,
];
