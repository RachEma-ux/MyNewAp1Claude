/**
 * Bases public-api barrel — T-F.1 MVP.
 */

export {
  createBase,
  listBases,
  getBaseSnapshot,
  updateBase,
  createBaseColumn,
  listBaseColumns,
  createBaseRow,
  updateBaseRow,
  listBaseRows,
  BaseRowUnknownColumnsError,
} from "./bases-service.js";
export type { ListBasesFilter } from "./bases-service.js";

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
