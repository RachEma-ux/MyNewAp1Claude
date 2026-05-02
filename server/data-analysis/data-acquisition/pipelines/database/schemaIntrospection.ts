/**
 * Database pipeline — schema introspection.
 *
 * Pure analyser over a schema descriptor that the connector fetched
 * (no DB SDK imports here — the worker / connector handles the actual
 * connection). Produces a normalized list of tables with column types
 * for the canonical record.
 */

export interface RawSchemaTable {
  schema?: string;
  name: string;
  columns: Array<{
    name: string;
    type: string;
    nullable?: boolean;
    primaryKey?: boolean;
  }>;
  rowCount?: number;
}

export interface NormalizedSchemaTable {
  schemaName: string;
  tableName: string;
  primaryKey: string | null;
  columns: Array<{ name: string; type: string; nullable: boolean }>;
  rowCount: number | null;
}

export function normalizeSchema(
  raw: RawSchemaTable[],
): NormalizedSchemaTable[] {
  return raw.map((t) => {
    const pk = t.columns.find((c) => c.primaryKey)?.name ?? null;
    return {
      schemaName: t.schema ?? "public",
      tableName: t.name,
      primaryKey: pk,
      columns: t.columns.map((c) => ({
        name: c.name,
        type: c.type,
        nullable: c.nullable ?? true,
      })),
      rowCount: t.rowCount ?? null,
    };
  });
}
