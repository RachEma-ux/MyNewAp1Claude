/**
 * Agent Studio Native Graph Workspace — Region registry.
 *
 * V2 Phase MR-1 first slice. ASDB-resident.
 *
 * Single-region MVP keeps `agsRegions` as a one-row table with
 * `regionKey="default"`. Multi-region operators add additional
 * rows + workspace → region pinning (workspace.regionId column to
 * be added in MR-2). Cross-region reads are denied unless the
 * workspace is replicated to multiple regions.
 *
 * Design:
 *   - `regionKey` is a stable slug (e.g. `"us-west-1"`, `"eu-west-1"`).
 *   - `postgresUri` + `neo4jUri` are non-secret endpoints; the
 *     credentials are resolved separately via secret bindings at
 *     connection-helper time (NOT stored here).
 *   - `isActive` is the operator-controlled gate; only active
 *     regions are valid routing targets.
 *   - `isPrimary` marks the canonical home region (single-region
 *     MVP defaults to true for the "default" row).
 *
 * ADR: docs/architecture/agent-studio-multi-region.md.
 */

import {
  boolean,
  index,
  json,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const agsRegions = pgTable(
  "ags_regions",
  {
    id: serial("id").primaryKey(),
    regionKey: varchar("region_key", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    postgresUri: text("postgres_uri").notNull(),
    neo4jUri: text("neo4j_uri"),
    /** Reference to provider-connections row that holds the
     *  credentials for this region's data plane. Null in
     *  single-region MVP — uses the global DB binding. */
    credentialBindingId: text("credential_binding_id"),
    isPrimary: boolean("is_primary").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    /** Operator-tunable per-region settings (replication lag SLO,
     *  failover priority, etc.). */
    settings: json("settings"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    regionKeyIdx: uniqueIndex("uniq_ags_regions_region_key").on(t.regionKey),
    activeIdx: index("idx_ags_regions_active").on(t.isActive),
    primaryIdx: index("idx_ags_regions_primary").on(t.isPrimary),
  }),
);

export type AgsRegion = typeof agsRegions.$inferSelect;
export type NewAgsRegion = typeof agsRegions.$inferInsert;
