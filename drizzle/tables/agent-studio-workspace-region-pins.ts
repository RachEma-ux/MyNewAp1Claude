/**
 * Agent Studio Native Graph Workspace — Workspace → Region pin registry.
 *
 * V2 Phase MR-1 Phase-2 first slice — the missing data-source for
 * actually routing a workspaceId to its home region. ASDB-resident.
 *
 * Companion to `agsRegions` (PR #754 — region registry). Where
 * `agsRegions` enumerates the available regions, `agsWorkspaceRegionPins`
 * records which workspace is pinned to which region. Without this
 * table, the MR-3 shim (`getAsDbForWorkspace`) has nothing to look up
 * — it always resolves to the primary region.
 *
 * Single-region operational baseline preserved:
 *   - Empty table = every workspace falls back to the primary region
 *     in `agsRegions` (existing `resolveWorkspaceRegion` semantics).
 *   - Multi-region operators populate one row per workspace as they
 *     onboard regions; the shim consults this table in a future PR.
 *
 * Design:
 *   - `workspaceId` is the platform workspaces.id (main DB integer
 *     PK). No Drizzle FK constraint because that table lives on the
 *     main DB, not ASDB. Operator process owns referential integrity
 *     across the DB boundary (mirrors the existing pattern for every
 *     `ags_*.workspace_id` column).
 *   - `regionKey` is a soft FK to `ags_regions.region_key` (same DB).
 *     Enforced at the service layer (insert-time validation).
 *   - `isReplicated` matches the `assertSameRegion()` replication
 *     flag — when true, cross-region reads from this workspace are
 *     allowed (caller surfaces the replication contract).
 *   - `notes` is operator free-text for runbook annotations
 *     ("moved 2026-Q3 to comply with data-residency request #1234").
 *
 * Hard-rule compliance:
 *   - Postgres = source of truth.
 *   - No `process.env.*_API_KEY` reads.
 *   - No `dispatchMcpToolCall` import — pin operations are data-plane
 *     metadata, not tool execution.
 *
 * ADR: docs/architecture/agent-studio-multi-region.md.
 */

import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const agsWorkspaceRegionPins = pgTable(
  "ags_workspace_region_pins",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull(),
    regionKey: varchar("region_key", { length: 80 }).notNull(),
    isReplicated: boolean("is_replicated").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    workspaceIdx: uniqueIndex("uniq_ags_workspace_region_pins_workspace").on(
      t.workspaceId,
    ),
    regionKeyIdx: index("idx_ags_workspace_region_pins_region_key").on(
      t.regionKey,
    ),
    replicatedIdx: index("idx_ags_workspace_region_pins_replicated").on(
      t.isReplicated,
    ),
  }),
);

export type AgsWorkspaceRegionPin =
  typeof agsWorkspaceRegionPins.$inferSelect;
export type NewAgsWorkspaceRegionPin =
  typeof agsWorkspaceRegionPins.$inferInsert;
