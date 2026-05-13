/**
 * Agent Studio Native Graph Workspace — Runtime alerts table.
 *
 * Phase J-1 (production hardening) enabling table. ASDB-resident.
 *
 * Used by `server/agent-studio/services/graph/health-alert.ts` to
 * persist threshold-breach events from the graph backend health
 * scan, and (future) any other runtime telemetry source that needs
 * an operator-queryable alert surface.
 *
 * Design:
 *   - `alertKey` is the canonical taxonomy slot (e.g.
 *     `graph_health_latency_high`, `graph_health_degraded`,
 *     `graph_health_unavailable`). Used for deduplication +
 *     dashboard grouping.
 *   - `severity` is a closed three-value ladder.
 *   - `observedValue` + `threshold` are jsonb for cross-source
 *     flexibility (latency-vs-ms, queue-depth-vs-count, etc.).
 *   - `raisedAt` is set on insert; `resolvedAt` is filled by a
 *     follow-up scan when the breach clears.
 *   - `scope` is a free-text bucket (`"default"`, workspace id,
 *     region) — single-region MVP uses `"default"`.
 *
 * ADR: `docs/architecture/agent-studio-neo4j-aura-upgrade-path.md`
 * §"Health alerting" + V1+ execution plan Phase J-1.
 */

import {
  index,
  json,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const agsRuntimeAlerts = pgTable(
  "ags_runtime_alerts",
  {
    id: serial("id").primaryKey(),
    alertKey: varchar("alert_key", { length: 100 }).notNull(),
    severity: varchar("severity", { length: 20 }).notNull(),
    scope: varchar("scope", { length: 100 }).notNull().default("default"),
    observedValue: json("observed_value"),
    threshold: json("threshold"),
    details: json("details"),
    raisedAt: timestamp("raised_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => ({
    alertKeyIdx: index("idx_ags_runtime_alerts_alert_key").on(t.alertKey),
    raisedAtIdx: index("idx_ags_runtime_alerts_raised_at").on(t.raisedAt),
    openByKeyIdx: index("idx_ags_runtime_alerts_open").on(
      t.alertKey,
      t.scope,
      t.resolvedAt,
    ),
  }),
);

export type AgsRuntimeAlert = typeof agsRuntimeAlerts.$inferSelect;
export type NewAgsRuntimeAlert = typeof agsRuntimeAlerts.$inferInsert;
