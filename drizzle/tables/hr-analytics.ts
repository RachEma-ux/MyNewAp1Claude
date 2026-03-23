/**
 * HR Analytics & Reporting Tables
 *
 * Report definitions and metric snapshots for HR dashboards.
 */

import {
  serial, varchar, text, integer, boolean, timestamp, date,
  json, pgTable, index,
} from "drizzle-orm/pg-core";

// ============================================================================
// Report Definitions — Saved/configured HR reports
// ============================================================================

export const hrReportDefinitions = pgTable("hr_report_definitions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }), // workforce | attrition | diversity | compensation | compliance | engagement | custom
  reportType: varchar("report_type", { length: 50 }).default("standard").notNull(), // standard | custom | scheduled
  config: json("config").$type<Record<string, unknown>>(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  categoryIdx: index("hr_report_def_cat_idx").on(table.category),
}));

export type HrReportDefinition = typeof hrReportDefinitions.$inferSelect;
export type InsertHrReportDefinition = typeof hrReportDefinitions.$inferInsert;

// ============================================================================
// Metric Snapshots — Periodic workforce metric captures
// ============================================================================

export const hrMetricSnapshots = pgTable("hr_metric_snapshots", {
  id: serial("id").primaryKey(),
  metricName: varchar("metric_name", { length: 100 }).notNull(),
  metricCategory: varchar("metric_category", { length: 100 }).notNull(), // headcount | attrition | diversity | engagement | compliance | time
  value: varchar("value", { length: 100 }).notNull(),
  unit: varchar("unit", { length: 50 }), // count | percent | currency | days | ratio
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  dimensions: json("dimensions").$type<Record<string, string>>(), // e.g. { orgUnit: "Engineering", workerType: "employee" }
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  nameIdx: index("hr_metric_snap_name_idx").on(table.metricName),
  categoryIdx: index("hr_metric_snap_cat_idx").on(table.metricCategory),
  periodIdx: index("hr_metric_snap_period_idx").on(table.periodStart, table.periodEnd),
}));

export type HrMetricSnapshot = typeof hrMetricSnapshots.$inferSelect;
export type InsertHrMetricSnapshot = typeof hrMetricSnapshots.$inferInsert;
