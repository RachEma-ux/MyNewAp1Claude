/**
 * PS Ideation Translator Runs — Persistence for Project Context Translator results
 *
 * Stores raw input, decision gate status, and full JSON result for each
 * translation run, providing traceability from raw input → translated output → applied output.
 */

import {
  serial,
  varchar,
  text,
  integer,
  timestamp,
  json,
  pgTable,
  index,
} from "drizzle-orm/pg-core";

export const psIdeationTranslatorRuns = pgTable("ps_ideation_translator_runs", {
  id: serial("id").primaryKey(),
  ideationId: integer("ideation_id").notNull(),
  rawInput: text("raw_input").notNull(),
  decisionGateStatus: varchar("decision_gate_status", { length: 50 }).notNull(), // CONTINUE | CLARIFICATION_NEEDED
  resultJson: json("result_json").$type<Record<string, unknown>>(),
  appliedAt: timestamp("applied_at"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  ideationIdx: index("ps_ideation_translator_runs_ideation_idx").on(table.ideationId),
  gateIdx: index("ps_ideation_translator_runs_gate_idx").on(table.decisionGateStatus),
}));

export type PsIdeationTranslatorRun = typeof psIdeationTranslatorRuns.$inferSelect;
export type InsertPsIdeationTranslatorRun = typeof psIdeationTranslatorRuns.$inferInsert;
