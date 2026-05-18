/**
 * Bases — domain types.
 *
 * Phase 24 MVP. The data model lives in
 * `drizzle/tables/agent-studio-bases.ts`; this file provides
 * service-layer DTO shapes + validation helpers + error classes.
 */

import { AGS_BASE_COLUMN_DATA_TYPES } from "../../../../drizzle/tables/agent-studio-bases.js";
import type {
  AgsBase,
  AgsBaseColumn,
  AgsBaseRow,
  AgsBaseColumnDataType,
} from "../../../../drizzle/tables/agent-studio-bases.js";

export type { AgsBase, AgsBaseColumn, AgsBaseRow, AgsBaseColumnDataType };
export { AGS_BASE_COLUMN_DATA_TYPES };

export interface CreateBaseInput {
  readonly workspaceId?: number | null;
  readonly vaultId?: number | null;
  readonly name: string;
  readonly slug: string;
  readonly description?: string;
  readonly icon?: string;
  readonly color?: string;
  readonly sortKey?: number;
  readonly createdByUserId?: number | null;
}

export interface UpdateBaseInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly icon?: string | null;
  readonly color?: string | null;
  readonly sortKey?: number | null;
  readonly archivedAt?: Date | null;
}

export interface CreateBaseColumnInput {
  readonly baseId: number;
  readonly key: string;
  readonly name: string;
  readonly dataType: AgsBaseColumnDataType;
  readonly config?: Record<string, unknown>;
  readonly sortKey?: number;
}

export interface CreateBaseRowInput {
  readonly baseId: number;
  readonly cells: Record<string, unknown>;
  readonly slug?: string;
  readonly noteId?: number | null;
  readonly sortKey?: number;
}

export interface UpdateBaseRowInput {
  readonly cells?: Record<string, unknown>;
  readonly noteId?: number | null;
  readonly sortKey?: number | null;
}

export interface BaseSnapshot {
  readonly base: AgsBase;
  readonly columns: readonly AgsBaseColumn[];
  readonly rows: readonly AgsBaseRow[];
}

// ----- Errors --------------------------------------------------------

export class AsdbUnavailableError extends Error {
  constructor() {
    super("ASDB is not configured");
    this.name = "AsdbUnavailableError";
  }
}

export class BaseNotFoundError extends Error {
  constructor(baseId: number) {
    super(`Base ${baseId} not found`);
    this.name = "BaseNotFoundError";
  }
}

export class BaseColumnNotFoundError extends Error {
  constructor(columnId: number) {
    super(`Base column ${columnId} not found`);
    this.name = "BaseColumnNotFoundError";
  }
}

export class BaseRowNotFoundError extends Error {
  constructor(rowId: number) {
    super(`Base row ${rowId} not found`);
    this.name = "BaseRowNotFoundError";
  }
}

export class BaseColumnDataTypeError extends Error {
  constructor(received: string) {
    super(
      `Invalid base column dataType "${received}" — must be one of ${AGS_BASE_COLUMN_DATA_TYPES.join(", ")}`,
    );
    this.name = "BaseColumnDataTypeError";
  }
}

export function isAgsBaseColumnDataType(
  v: unknown,
): v is AgsBaseColumnDataType {
  return (
    typeof v === "string" &&
    (AGS_BASE_COLUMN_DATA_TYPES as readonly string[]).includes(v)
  );
}
