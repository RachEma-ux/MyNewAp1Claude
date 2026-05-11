/**
 * Agent Studio Native Graph Workspace — Promotion + graph change proposals + references.
 *
 * Phase 10 / 11 / 11.5 tables. ASDB-resident.
 *
 * ADRs:
 *   - agent-studio-note-promotion-binding-semantics.md
 *   - agent-studio-lightweight-source-note-references.md
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
  varchar,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ============================================================================
// Promotion lifecycle
// ============================================================================

export const agsNotePromotions = pgTable(
  "ags_note_promotions",
  {
    id: serial("id").primaryKey(),
    noteId: integer("note_id").notNull(),
    noteVersionId: integer("note_version_id").notNull(),
    promotionKind: varchar("promotion_kind", { length: 50 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    initiatedByUserId: integer("initiated_by_user_id"),
    approvedByUserId: integer("approved_by_user_id"),
    approvedAt: timestamp("approved_at"),
    rejectedAt: timestamp("rejected_at"),
    rejectionReason: text("rejection_reason"),
    rolledBackAt: timestamp("rolled_back_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    noteIdx: index("idx_ags_note_promotions_note").on(t.noteId),
    statusIdx: index("idx_ags_note_promotions_status").on(t.status),
    kindIdx: index("idx_ags_note_promotions_kind").on(t.promotionKind),
  }),
);

export const agsNotePromotionVersions = pgTable(
  "ags_note_promotion_versions",
  {
    id: serial("id").primaryKey(),
    promotionId: integer("promotion_id").notNull().references(() => agsNotePromotions.id),
    version: varchar("version", { length: 50 }).notNull(),
    targetAssetId: integer("target_asset_id"),
    targetAssetVersion: varchar("target_asset_version", { length: 50 }),
    active: boolean("active").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqueVersion: uniqueIndex("idx_ags_note_promotion_versions_unique").on(t.promotionId, t.version),
  }),
);

export const agsNotePromotionDecisions = pgTable(
  "ags_note_promotion_decisions",
  {
    id: serial("id").primaryKey(),
    promotionId: integer("promotion_id").notNull().references(() => agsNotePromotions.id),
    decision: varchar("decision", { length: 50 }).notNull(),
    decidedByUserId: integer("decided_by_user_id").notNull(),
    rationale: text("rationale"),
    decidedAt: timestamp("decided_at").defaultNow().notNull(),
  },
);

export const agsNoteRuntimeBindings = pgTable(
  "ags_note_runtime_bindings",
  {
    id: serial("id").primaryKey(),
    promotionVersionId: integer("promotion_version_id").notNull().references(() => agsNotePromotionVersions.id),
    bindingKind: varchar("binding_kind", { length: 50 }).notNull(),
    bindingTargetId: text("binding_target_id").notNull(),
    bindingTargetVersionId: text("binding_target_version_id").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsNotePromotionAuditEvents = pgTable(
  "ags_note_promotion_audit_events",
  {
    id: serial("id").primaryKey(),
    promotionId: integer("promotion_id").notNull().references(() => agsNotePromotions.id),
    eventKind: varchar("event_kind", { length: 100 }).notNull(),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

// ============================================================================
// Graph change proposals (Phase 11.5)
// ============================================================================

export const agsGraphChangeProposals = pgTable(
  "ags_graph_change_proposals",
  {
    id: serial("id").primaryKey(),
    proposalKind: varchar("proposal_kind", { length: 100 }).notNull(),
    proposedByUserId: integer("proposed_by_user_id"),
    proposedByAgentId: integer("proposed_by_agent_id"),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    summary: text("summary"),
    confidence: varchar("confidence", { length: 10 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("idx_ags_graph_change_proposals_status").on(t.status),
    kindIdx: index("idx_ags_graph_change_proposals_kind").on(t.proposalKind),
  }),
);

export const agsGraphChangeProposalItems = pgTable(
  "ags_graph_change_proposal_items",
  {
    id: serial("id").primaryKey(),
    proposalId: integer("proposal_id").notNull().references(() => agsGraphChangeProposals.id),
    itemKind: varchar("item_kind", { length: 100 }).notNull(),
    itemPayload: json("item_payload").$type<Record<string, unknown>>().notNull(),
    sourceEvidence: json("source_evidence").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphChangeDecisions = pgTable(
  "ags_graph_change_decisions",
  {
    id: serial("id").primaryKey(),
    proposalId: integer("proposal_id").notNull().references(() => agsGraphChangeProposals.id),
    decision: varchar("decision", { length: 50 }).notNull(),
    decidedByUserId: integer("decided_by_user_id"),
    rationale: text("rationale"),
    decidedAt: timestamp("decided_at").defaultNow().notNull(),
  },
);

export const agsGraphChangeAuditEvents = pgTable(
  "ags_graph_change_audit_events",
  {
    id: serial("id").primaryKey(),
    proposalId: integer("proposal_id").notNull().references(() => agsGraphChangeProposals.id),
    eventKind: varchar("event_kind", { length: 100 }).notNull(),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

// ============================================================================
// Source-note references (Phase 10) — reference ≠ promotion
// ============================================================================

export const agsRuntimeAssetSourceReferences = pgTable(
  "ags_runtime_asset_source_references",
  {
    id: serial("id").primaryKey(),
    runtimeAssetKind: varchar("runtime_asset_kind", { length: 50 }).notNull(),
    runtimeAssetId: integer("runtime_asset_id").notNull(),
    sourceNoteId: integer("source_note_id").notNull(),
    sourceNoteVersionId: integer("source_note_version_id").notNull(),
    referenceType: varchar("reference_type", { length: 50 }).notNull(),
    requiredForRuntime: boolean("required_for_runtime").notNull().default(false),
    promptInclusionAllowed: boolean("prompt_inclusion_allowed").notNull().default(false),
    neo4jRelationshipId: text("neo4j_relationship_id"),
    projectionSnapshotId: text("projection_snapshot_id"),
    createdByUserId: integer("created_by_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    assetIdx: index("idx_ags_runtime_asset_source_references_asset").on(t.runtimeAssetKind, t.runtimeAssetId),
    noteIdx: index("idx_ags_runtime_asset_source_references_note").on(t.sourceNoteId),
  }),
);

export const agsCagBlockNoteReferences = pgTable(
  "ags_cag_block_note_references",
  {
    id: serial("id").primaryKey(),
    cagBlockId: integer("cag_block_id").notNull(),
    cagBlockVersion: varchar("cag_block_version", { length: 50 }).notNull(),
    noteId: integer("note_id").notNull(),
    noteVersionId: integer("note_version_id").notNull(),
    referenceType: varchar("reference_type", { length: 50 }).notNull(),
    promptInclusionAllowed: boolean("prompt_inclusion_allowed").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphSkillNoteReferences = pgTable(
  "ags_graph_skill_note_references",
  {
    id: serial("id").primaryKey(),
    packId: integer("pack_id").notNull(),
    packVersion: varchar("pack_version", { length: 50 }).notNull(),
    noteId: integer("note_id").notNull(),
    noteVersionId: integer("note_version_id").notNull(),
    referenceType: varchar("reference_type", { length: 50 }).notNull(),
    promptInclusionAllowed: boolean("prompt_inclusion_allowed").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsRuntimeNoteReferences = pgTable(
  "ags_runtime_note_references",
  {
    id: serial("id").primaryKey(),
    runtimeRunId: integer("runtime_run_id").notNull(),
    noteId: integer("note_id").notNull(),
    noteVersionId: integer("note_version_id").notNull(),
    referenceKind: varchar("reference_kind", { length: 50 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

/**
 * Phase 14 §6/§7. Per-run record of which CAG capability packs were
 * used during a runtime run. Parallels `ags_graph_skill_runtime_usages`
 * on the Skill Pack side. The Phase 14 projection layer reads this to
 * emit `(:RuntimeTrace)-[:USED_CAG_BLOCK]->(:CAGBlock)` edges.
 *
 * `cagPackId` references `ags_cag_capability_packs.id`. `packVersion`
 * mirrors the pack's `pack_version` at use-time so the trace
 * faithfully records which version flowed through the run, even if
 * the pack is mutated later.
 *
 * The CAG resolver-side writer that inserts these rows is a separate
 * follow-up — this PR ships the projection-side reader + expander only.
 */
export const agsCagBlockRuntimeUsages = pgTable(
  "ags_cag_block_runtime_usages",
  {
    id: serial("id").primaryKey(),
    cagPackId: integer("cag_pack_id").notNull(),
    packVersion: integer("pack_version").notNull(),
    runtimeRunId: integer("runtime_run_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);
