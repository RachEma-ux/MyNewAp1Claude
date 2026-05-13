/**
 * Agent Studio Native Graph Workspace — Sync/publish target registry.
 *
 * Phase 19-α enabling tables. ASDB-resident.
 *
 * Used by `server/agent-studio/services/publish-targets/` (PR-V1-2)
 * to register external destinations a published artifact can flow
 * to: a staging environment, a remote vault, or an external KB.
 *
 * Design:
 *   - `targetKey` is a stable identifier (slug) operators can
 *     reference from CLI/scripts; the surrogate `id` is the FK
 *     anchor for execution rows.
 *   - `targetType` is a closed three-value union (validated by the
 *     service layer; column itself is varchar for additive growth).
 *   - `providerConnectionId` is the Plan v3 D1 anchor — credentials
 *     are NEVER stored in this table. They flow through
 *     `withProviderCredential(providerConnectionId, ...)` at push
 *     time. If a target type doesn't need credentials (e.g. an
 *     anonymous staging webhook), the column is null.
 *   - `endpoint` is the target URL / connection string; non-secret.
 *
 * Execution ledger:
 *   - `agsPublishTargetExecutions` records every push attempt with
 *     the source `notePromotionId` for rollback walking (V1+ plan
 *     Phase 19 acceptance criterion #4).
 *   - `status` is a closed four-value ladder
 *     (`pending` | `in_flight` | `succeeded` | `failed`).
 *   - `attempt` increments per retry (idempotency via the
 *     `(target_id, source_promotion_id, attempt)` unique tuple).
 *
 * Hard-rule compliance (CLAUDE.md / Plan v3 D1):
 *   - No raw `*_API_KEY` storage. Credentials live in the secrets
 *     subsystem and are fetched via `withProviderCredential`.
 *   - No graph mutation from publish targets (read-only consumers
 *     of `agsNotePromotions` + cascade tables).
 *
 * ADR: V1+ execution plan §"Phase 19 — Sync / publish strategy".
 */

import {
  boolean,
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

export const agsPublishTargets = pgTable(
  "ags_publish_targets",
  {
    id: serial("id").primaryKey(),
    targetKey: varchar("target_key", { length: 120 }).notNull(),
    targetType: varchar("target_type", { length: 40 }).notNull(),
    endpoint: text("endpoint").notNull(),
    /**
     * Optional Plan v3 D1 anchor — null when the target does not
     * need a credential (e.g. a staging webhook on a private VPC).
     */
    providerConnectionId: integer("provider_connection_id"),
    /** Operator-tunable per-target metadata (max payload size,
     *  signing key id, etc.). */
    config: json("config"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    targetKeyIdx: uniqueIndex("uniq_ags_publish_targets_target_key").on(
      t.targetKey,
    ),
    typeIdx: index("idx_ags_publish_targets_type").on(t.targetType),
  }),
);

export const agsPublishTargetExecutions = pgTable(
  "ags_publish_target_executions",
  {
    id: serial("id").primaryKey(),
    targetId: integer("target_id")
      .notNull()
      .references(() => agsPublishTargets.id),
    sourcePromotionId: integer("source_promotion_id").notNull(),
    sourceVersionId: text("source_version_id"),
    attempt: integer("attempt").notNull().default(1),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    /** Push payload digest for idempotency + drift detection. */
    payloadDigest: text("payload_digest"),
    /** Upstream-issued artifact id; useful for rollback. */
    upstreamArtifactId: text("upstream_artifact_id"),
    errorMessage: text("error_message"),
    /** Free-form per-attempt details (latencyMs, http status, etc.). */
    details: json("details"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    targetIdx: index("idx_ags_publish_target_executions_target").on(t.targetId),
    promotionIdx: index("idx_ags_publish_target_executions_promotion").on(
      t.sourcePromotionId,
    ),
    statusIdx: index("idx_ags_publish_target_executions_status").on(t.status),
    idempotencyIdx: uniqueIndex(
      "uniq_ags_publish_target_executions_idempotency",
    ).on(t.targetId, t.sourcePromotionId, t.attempt),
  }),
);

export type AgsPublishTarget = typeof agsPublishTargets.$inferSelect;
export type NewAgsPublishTarget = typeof agsPublishTargets.$inferInsert;
export type AgsPublishTargetExecution =
  typeof agsPublishTargetExecutions.$inferSelect;
export type NewAgsPublishTargetExecution =
  typeof agsPublishTargetExecutions.$inferInsert;
