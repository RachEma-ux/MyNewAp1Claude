/**
 * Graph Projection — public API barrel.
 *
 * Phase 1.7 / 7.5 entry surface.
 */

export type { ProjectionEvent, ProjectionJobResult, ProjectionSyncWorkerOptions } from "./sync-worker.js";
export { ProjectionSyncWorker } from "./sync-worker.js";

export type { DriftClass, DriftEvent, DriftReport, SourceRowCount, DriftDetectorInput } from "./drift-detector.js";
export { DriftDetector } from "./drift-detector.js";

export type {
  RebuildScope,
  ReplayCounts,
  ReplayResult,
  RebuildReplayDeps,
  NoteSourceRow,
  WikilinkSourceRow,
  BaseSourceRow,
  BaseRowSourceRow,
} from "./rebuild-replay.js";
export {
  SUPPORTED_REBUILD_SCOPES,
  isSupportedScope,
  replayProjectionScope,
} from "./rebuild-replay.js";
