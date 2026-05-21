/**
 * Bases public-api barrel — T-F.1 MVP.
 */

export {
  createBase,
  listBases,
  getBaseSnapshot,
  updateBase,
  archiveBase,
  unarchiveBase,
  createBaseColumn,
  listBaseColumns,
  updateBaseColumn,
  deleteBaseColumn,
  createBaseRow,
  updateBaseRow,
  deleteBaseRow,
  listBaseRows,
  BaseRowUnknownColumnsError,
} from "./bases-service.js";
export type {
  ListBasesFilter,
  UpdateBaseColumnInput,
} from "./bases-service.js";

export {
  enqueueBaseProjection,
  enqueueBaseDeletion,
  enqueueBaseRowProjection,
  enqueueBaseRowRemoval,
} from "./graph-projection.js";
export type {
  BaseProjectionEventKind,
  EnqueueBaseProjectionInput,
  EnqueueBaseRowProjectionInput,
} from "./graph-projection.js";

export {
  AsdbUnavailableError,
  BaseNotFoundError,
  BaseColumnNotFoundError,
  BaseRowNotFoundError,
  BaseColumnDataTypeError,
  isAgsBaseColumnDataType,
  AGS_BASE_COLUMN_DATA_TYPES,
} from "./types.js";
export type {
  AgsBase,
  AgsBaseColumn,
  AgsBaseRow,
  AgsBaseColumnDataType,
  BaseSnapshot,
  CreateBaseInput,
  CreateBaseColumnInput,
  CreateBaseRowInput,
  UpdateBaseInput,
  UpdateBaseRowInput,
} from "./types.js";
