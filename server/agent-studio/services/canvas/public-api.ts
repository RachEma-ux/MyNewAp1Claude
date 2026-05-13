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
} from "./types.js";

export {
  CANVAS_NODE_KINDS,
  isCanvasNodeKind,
  CanvasNotFoundError,
  CanvasNodeKindError,
} from "./types.js";

export {
  AsdbUnavailableError,
  createCanvas,
  getCanvasById,
  listCanvasesByVault,
  createCanvasNode,
  createCanvasEdge,
  getCanvasSnapshot,
  listNoteReferencesForCanvas,
} from "./canvas-service.js";
