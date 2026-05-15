/**
 * Canvas service — public API barrel.
 *
 * V1+ Phase 17-α first slice.
 */

export type {
  CanvasNodeKind,
  CanvasRecord,
  CanvasNodeRecord,
  CanvasEdgeRecord,
  CanvasSnapshot,
  CreateCanvasInput,
  CreateCanvasNodeInput,
  CreateCanvasEdgeInput,
  UpdateCanvasNodeInput,
} from "./types.js";

export {
  CANVAS_NODE_KINDS,
  isCanvasNodeKind,
  CanvasNotFoundError,
  CanvasNodeKindError,
  CanvasNodeNotFoundError,
} from "./types.js";

export {
  AsdbUnavailableError,
  createCanvas,
  getCanvasById,
  listCanvasesByVault,
  createCanvasNode,
  updateCanvasNode,
  deleteCanvasNode,
  createCanvasEdge,
  getCanvasSnapshot,
  listNoteReferencesForCanvas,
} from "./canvas-service.js";

// V1+ Phase 17-β: projection helpers (CANVAS_REFERENCES_NOTE edge).
export {
  buildCanvasReferenceProjection,
  buildCanvasReferenceRemoval,
  buildAllCanvasReferenceProjections,
} from "./projection.js";
export type {
  CanvasReferenceInput,
  CanvasReferenceRemovalInput,
  BuildAllCanvasReferencesInput,
} from "./projection.js";

// V1+ 17-γ: canvas → graph projection events sink (caller→worker
// glue). Mirrors AS-2's default-governance-gate registry pattern.
export {
  registerCanvasProjectionEventSink,
  getCanvasProjectionEventSink,
  hasCanvasProjectionEventSink,
  __resetCanvasProjectionEventSinkForTests,
  recordCanvasProjectionEvent,
} from "./projection-events-sink.js";
export type {
  CanvasProjectionEvent,
  CanvasProjectionEventSink,
} from "./projection-events-sink.js";
