/**
 * Data Warehouse Tables — ISO PM × NAICS 2022
 *
 * 5-table normalized model for sector→industry→scope→standard mappings.
 * All tables prefixed with `dw_` to avoid collision if co-located.
 */

import {
  serial,
  varchar,
  pgTable,
  text,
  index,
} from "drizzle-orm/pg-core";

// ── Table 1: Sectors (NAICS top-level) ──────────────────────────────────────

export const dwSectors = pgTable("dw_sectors", {
  id: serial("id").primaryKey(),
  sectorCode: varchar("sector_code", { length: 10 }).notNull().unique(),
  sectorTitle: varchar("sector_title", { length: 255 }).notNull(),
});

export type DwSector = typeof dwSectors.$inferSelect;
export type InsertDwSector = typeof dwSectors.$inferInsert;

// ── Table 2: Industries (NAICS 6-digit) ─────────────────────────────────────

export const dwIndustries = pgTable(
  "dw_industries",
  {
    id: serial("id").primaryKey(),
    naicsCode: varchar("naics_code", { length: 10 }).notNull().unique(),
    industryTitle: varchar("industry_title", { length: 255 }).notNull(),
    sectorCode: varchar("sector_code", { length: 10 }).notNull(),
  },
  (table) => ({
    sectorIdx: index("idx_dw_industries_sector").on(table.sectorCode),
  })
);

export type DwIndustry = typeof dwIndustries.$inferSelect;
export type InsertDwIndustry = typeof dwIndustries.$inferInsert;

// ── Table 3: Scopes (sector-relative PM scope areas) ────────────────────────

export const dwScopes = pgTable(
  "dw_scopes",
  {
    id: serial("id").primaryKey(),
    sectorCode: varchar("sector_code", { length: 10 }).notNull(),
    scopeId: varchar("scope_id", { length: 10 }).notNull(),
    scopeLabel: varchar("scope_label", { length: 255 }).notNull(),
    scopeDescription: text("scope_description").default("").notNull(),
  },
  (table) => ({
    sectorIdx: index("idx_dw_scopes_sector").on(table.sectorCode),
    uniqueScope: index("idx_dw_scopes_unique").on(table.sectorCode, table.scopeId),
  })
);

export type DwScope = typeof dwScopes.$inferSelect;
export type InsertDwScope = typeof dwScopes.$inferInsert;

// ── Table 4: Standards (PM/ISO/governance standards) ────────────────────────

export const dwStandards = pgTable("dw_standards", {
  id: serial("id").primaryKey(),
  standardCode: varchar("standard_code", { length: 100 }).notNull().unique(),
  standardName: varchar("standard_name", { length: 500 }).notNull(),
  issuingBody: varchar("issuing_body", { length: 255 }).notNull(),
});

export type DwStandard = typeof dwStandards.$inferSelect;
export type InsertDwStandard = typeof dwStandards.$inferInsert;

// ── Table 5: Junction — Industry × Scope × Standard mappings ───────────────

export const dwIndustryScopeStandards = pgTable(
  "dw_industry_scope_standards",
  {
    id: serial("id").primaryKey(),
    naicsCode: varchar("naics_code", { length: 10 }).notNull(),
    sectorCode: varchar("sector_code", { length: 10 }).notNull(),
    scopeId: varchar("scope_id", { length: 10 }).notNull(),
    standardCode: varchar("standard_code", { length: 100 }).notNull(),
    standardNameContextual: varchar("standard_name_contextual", { length: 500 }),
    relevance: text("relevance").notNull(),
  },
  (table) => ({
    naicsIdx: index("idx_dw_iss_naics").on(table.naicsCode),
    scopeIdx: index("idx_dw_iss_scope").on(table.scopeId),
    standardIdx: index("idx_dw_iss_standard").on(table.standardCode),
    sectorIdx: index("idx_dw_iss_sector").on(table.sectorCode),
    compositeIdx: index("idx_dw_iss_composite").on(
      table.naicsCode,
      table.scopeId,
      table.standardCode
    ),
  })
);

export type DwIndustryScopeStandard = typeof dwIndustryScopeStandards.$inferSelect;
export type InsertDwIndustryScopeStandard = typeof dwIndustryScopeStandards.$inferInsert;
