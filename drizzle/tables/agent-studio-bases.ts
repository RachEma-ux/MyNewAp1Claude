/**
 * Agent Studio Native Graph Workspace — Bases tables.
 *
 * Phase 24 — Bases MVP (T-F.1). Lightweight database-like surface
 * (column schema + tabular rows) for capturing structured records
 * alongside a vault. Modeled on Obsidian's "Bases" plugin: every
 * row is an instance of a base's column schema; rows may optionally
 * link back to a note (via `noteId`) so a Base can act as a
 * structured index over a vault.
 *
 * Tables (all ASDB-resident):
 *   - `ags_bases` — top-level Base entity (analogous to `ags_vaults`)
 *   - `ags_base_columns` — schema columns per Base
 *   - `ags_base_rows` — row instances per Base
 *
 * Out of scope for the MVP (deferred to Phase 24 tier 2+):
 *   - Per-row permissions (Bases inherit vault-level visibility)
 *   - Saved-views over Bases (filter / sort / group)
 *   - Linked-Base columns (cross-Base joins)
 *   - Formulas / computed columns
 *
 * Drizzle reconciler picks these up via the existing reconciler boot
 * path. No SQL migrations required — `ALTER TABLE ADD COLUMN IF NOT
 * EXISTS` semantics apply.
 *
 * ADR: docs/architecture/agent-studio-native-graph-workspace.md §Phase-24
 *      (forward roadmap entry — Bases MVP)
 */

import {
  index,
  integer,
  json,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ============================================================================
// Bases — top-level entity
// ============================================================================

export const agsBases = pgTable(
  "ags_bases",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id"),
    /**
     * Optional vault association. When set, the Base is "scoped" to
     * the vault and its rows can link notes from that vault by
     * `noteId`. When null, the Base is workspace-global.
     */
    vaultId: integer("vault_id"),
    name: varchar("name", { length: 255 }).notNull(),
    /**
     * URL-safe slug, unique within the parent workspace (or globally
     * when `workspaceId` is null — same convention as `ags_vaults`).
     */
    slug: varchar("slug", { length: 255 }).notNull(),
    description: text("description"),
    /**
     * Icon glyph name (e.g. "table", "database"). Pure presentation —
     * the server doesn't validate against a known list.
     */
    icon: varchar("icon", { length: 64 }),
    /**
     * Hex color string ("#RRGGBB"). Optional presentation only.
     */
    color: varchar("color", { length: 16 }),
    /**
     * Operator-controlled display order within a workspace's Base
     * listing. Smaller values sort first; null = unsorted (treated as
     * +∞ at sort time).
     */
    sortKey: integer("sort_key"),
    createdByUserId: integer("created_by_user_id"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex("idx_ags_bases_slug").on(t.workspaceId, t.slug),
    workspaceIdx: index("idx_ags_bases_workspace").on(t.workspaceId),
    vaultIdx: index("idx_ags_bases_vault").on(t.vaultId),
  }),
);

// ============================================================================
// Base columns — schema layer
// ============================================================================

/**
 * Supported column data types for the MVP. `note_link` is a special
 * case — its value is a serialized {noteId, vaultId} pair (handled at
 * the application layer; the column stores it as JSON in the
 * row's `cells` payload).
 */
export const AGS_BASE_COLUMN_DATA_TYPES = [
  "text",
  "number",
  "date",
  "checkbox",
  "select",
  "multiselect",
  "note_link",
] as const;
export type AgsBaseColumnDataType =
  (typeof AGS_BASE_COLUMN_DATA_TYPES)[number];

export const agsBaseColumns = pgTable(
  "ags_base_columns",
  {
    id: serial("id").primaryKey(),
    baseId: integer("base_id").notNull().references(() => agsBases.id),
    /**
     * Stable column key used in `ags_base_rows.cells`. Unique per
     * Base. Operators rename `name` freely without breaking row
     * payloads.
     */
    key: varchar("key", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    /**
     * Column data type. Pre-validated at the tRPC boundary against
     * `AGS_BASE_COLUMN_DATA_TYPES`. Stored as varchar so future
     * additions don't require schema migration.
     */
    dataType: varchar("data_type", { length: 32 }).notNull(),
    /**
     * Per-type configuration. Examples:
     *   - select / multiselect: `{ options: ["a", "b", "c"] }`
     *   - date: `{ includeTime: true }`
     *   - number: `{ precision: 2 }`
     */
    config: json("config").$type<Record<string, unknown>>(),
    /**
     * Column-display order within the Base; smaller values render
     * leftmost.
     */
    sortKey: integer("sort_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    keyIdx: uniqueIndex("idx_ags_base_columns_key").on(t.baseId, t.key),
    baseIdx: index("idx_ags_base_columns_base").on(t.baseId),
  }),
);

// ============================================================================
// Base rows — row instances
// ============================================================================

export const agsBaseRows = pgTable(
  "ags_base_rows",
  {
    id: serial("id").primaryKey(),
    baseId: integer("base_id").notNull().references(() => agsBases.id),
    /**
     * Optional stable URL-safe slug for the row, unique per Base. The
     * MVP exposes rows by integer id; slug is reserved for the
     * tier-2 UI (deep-linkable row pages).
     */
    slug: varchar("slug", { length: 255 }),
    /**
     * Optional linked note. When set, the row carries metadata that
     * supplements an existing vault note. Both note-side and base-side
     * UIs render the link.
     */
    noteId: integer("note_id"),
    /**
     * Row cell values, keyed by `ags_base_columns.key`. Type validation
     * is application-layer (the column schema describes which keys are
     * valid). A missing key = unset.
     */
    cells: json("cells").$type<Record<string, unknown>>().notNull(),
    /**
     * Row-display order within the Base; smaller values sort first.
     */
    sortKey: integer("sort_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex("idx_ags_base_rows_slug").on(t.baseId, t.slug),
    baseIdx: index("idx_ags_base_rows_base").on(t.baseId),
    noteIdx: index("idx_ags_base_rows_note").on(t.noteId),
  }),
);

export type AgsBase = typeof agsBases.$inferSelect;
export type AgsBaseColumn = typeof agsBaseColumns.$inferSelect;
export type AgsBaseRow = typeof agsBaseRows.$inferSelect;
