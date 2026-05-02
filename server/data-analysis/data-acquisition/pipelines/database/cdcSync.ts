/**
 * Database pipeline — CDC (change-data-capture) row normalizer.
 *
 * Receives CDC events emitted by the worker (Debezium / wal2json /
 * MySQL binlog / etc.) and shapes them into
 * `data_acquisition_db_records` rows. Pure function.
 */

import type { InsertDataAcquisitionDbRecord } from "../../../../../drizzle/schema";

export interface CdcRawEvent {
  schema?: string;
  table: string;
  primaryKey?: string | number | null;
  operation: "insert" | "update" | "delete" | "snapshot";
  row?: Record<string, unknown>;
  before?: Record<string, unknown>;
  cdcLsn?: string;
  capturedAt?: string | number | Date;
}

export function normalizeCdcEvent(
  itemId: number,
  raw: CdcRawEvent,
): InsertDataAcquisitionDbRecord {
  const rowJson: Record<string, unknown> = {
    after: raw.row ?? null,
    before: raw.before ?? null,
  };
  return {
    itemId,
    schemaName: raw.schema ?? "public",
    tableName: raw.table,
    primaryKey: raw.primaryKey === null || raw.primaryKey === undefined ? null : String(raw.primaryKey),
    operation: raw.operation,
    rowJson,
    cdcLsn: raw.cdcLsn ?? null,
    capturedAt: raw.capturedAt ? new Date(raw.capturedAt) : null,
  };
}

export function normalizeCdcBatch(
  itemId: number,
  raws: CdcRawEvent[],
): InsertDataAcquisitionDbRecord[] {
  return raws.map((r) => normalizeCdcEvent(itemId, r));
}
