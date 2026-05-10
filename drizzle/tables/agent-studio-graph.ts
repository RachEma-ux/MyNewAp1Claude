/**
 * Agent Studio Native Graph Workspace — Typed graph + ontology + ER + provenance.
 *
 * Phase 1.6 / Phase 7 enabling tables. ASDB-resident.
 *
 * Postgres source-of-truth for graph metadata. Neo4j CE projections derived
 * from these records via the projection sync layer.
 *
 * ADRs:
 *   - agent-studio-graph-ontology-registry.md
 *   - agent-studio-graph-constraint-registry.md
 *   - agent-studio-entity-resolution.md
 *   - agent-studio-graph-provenance-lineage.md
 *   - agent-studio-temporal-observation-model.md
 *   - agent-studio-graph-query-cache-and-projection-snapshots.md
 *   - agent-studio-graph-layout-registry.md
 */

import {
  boolean,
  index,
  integer,
  json,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ============================================================================
// Ontology
// ============================================================================

export const agsGraphOntologyNodeTypes = pgTable(
  "ags_graph_ontology_node_types",
  {
    id: serial("id").primaryKey(),
    typeKey: varchar("type_key", { length: 100 }).notNull().unique(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 100 }),
    isVersioned: boolean("is_versioned").notNull().default(false),
    governanceRequired: boolean("governance_required").notNull().default(false),
    retentionClass: varchar("retention_class", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphOntologyEdgeTypes = pgTable(
  "ags_graph_ontology_edge_types",
  {
    id: serial("id").primaryKey(),
    typeKey: varchar("type_key", { length: 100 }).notNull().unique(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    description: text("description"),
    sourceNodeTypeKeys: json("source_node_type_keys").$type<string[]>().notNull(),
    targetNodeTypeKeys: json("target_node_type_keys").$type<string[]>().notNull(),
    cardinality: varchar("cardinality", { length: 50 }),
    isDirected: boolean("is_directed").notNull().default(true),
    governanceRequired: boolean("governance_required").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphOntologyPropertyDefinitions = pgTable(
  "ags_graph_ontology_property_definitions",
  {
    id: serial("id").primaryKey(),
    typeKey: varchar("type_key", { length: 100 }).notNull(),
    typeKind: varchar("type_kind", { length: 50 }).notNull(), // 'node' | 'edge'
    propertyKey: varchar("property_key", { length: 100 }).notNull(),
    propertyType: varchar("property_type", { length: 50 }).notNull(),
    required: boolean("required").notNull().default(false),
    defaultValue: text("default_value"),
    validationRegex: text("validation_regex"),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqueKey: uniqueIndex("idx_ags_graph_ontology_property_unique").on(t.typeKey, t.typeKind, t.propertyKey),
  }),
);

// ============================================================================
// Constraints
// ============================================================================

export const agsGraphConstraints = pgTable(
  "ags_graph_constraints",
  {
    id: serial("id").primaryKey(),
    constraintKey: varchar("constraint_key", { length: 100 }).notNull().unique(),
    constraintClass: varchar("constraint_class", { length: 50 }).notNull(),
    appliesToTypeKey: varchar("applies_to_type_key", { length: 100 }).notNull(),
    appliesToTypeKind: varchar("applies_to_type_kind", { length: 50 }).notNull(),
    expression: text("expression").notNull(),
    severity: varchar("severity", { length: 50 }).notNull().default("error"),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphConstraintViolations = pgTable(
  "ags_graph_constraint_violations",
  {
    id: serial("id").primaryKey(),
    constraintId: integer("constraint_id").notNull().references(() => agsGraphConstraints.id),
    violatedAt: timestamp("violated_at").defaultNow().notNull(),
    sourceTypeKey: varchar("source_type_key", { length: 100 }),
    sourceId: text("source_id"),
    details: json("details").$type<Record<string, unknown>>(),
    remediation: varchar("remediation", { length: 100 }),
    remediatedAt: timestamp("remediated_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

// ============================================================================
// Nodes + edges (Postgres source-of-truth metadata; Neo4j is the projection)
// ============================================================================

export const agsGraphNodes = pgTable(
  "ags_graph_nodes",
  {
    id: serial("id").primaryKey(),
    typeKey: varchar("type_key", { length: 100 }).notNull(),
    nodeKey: varchar("node_key", { length: 255 }).notNull(),
    label: varchar("label", { length: 500 }),
    workspaceId: integer("workspace_id"),
    sourceType: varchar("source_type", { length: 100 }).notNull(),
    sourceId: text("source_id").notNull(),
    sourceVersionId: text("source_version_id"),
    governanceStatus: varchar("governance_status", { length: 50 }).notNull().default("active"),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    neo4jNodeId: text("neo4j_node_id"),
    projectionSnapshotId: text("projection_snapshot_id"),
    validFrom: timestamp("valid_from").defaultNow().notNull(),
    validTo: timestamp("valid_to"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    typeIdx: index("idx_ags_graph_nodes_type").on(t.typeKey),
    sourceIdx: index("idx_ags_graph_nodes_source").on(t.sourceType, t.sourceId),
    keyIdx: uniqueIndex("idx_ags_graph_nodes_key").on(t.typeKey, t.nodeKey),
    governanceIdx: index("idx_ags_graph_nodes_governance").on(t.governanceStatus),
  }),
);

export const agsGraphEdges = pgTable(
  "ags_graph_edges",
  {
    id: serial("id").primaryKey(),
    typeKey: varchar("type_key", { length: 100 }).notNull(),
    edgeKey: varchar("edge_key", { length: 500 }),
    sourceNodeId: integer("source_node_id").notNull().references(() => agsGraphNodes.id),
    targetNodeId: integer("target_node_id").notNull().references(() => agsGraphNodes.id),
    sourceType: varchar("source_type", { length: 100 }).notNull(),
    sourceId: text("source_id").notNull(),
    sourceVersionId: text("source_version_id"),
    governanceStatus: varchar("governance_status", { length: 50 }).notNull().default("active"),
    weight: numeric("weight", { precision: 5, scale: 4 }),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    neo4jRelationshipId: text("neo4j_relationship_id"),
    projectionSnapshotId: text("projection_snapshot_id"),
    validFrom: timestamp("valid_from").defaultNow().notNull(),
    validTo: timestamp("valid_to"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    typeIdx: index("idx_ags_graph_edges_type").on(t.typeKey),
    sourceNodeIdx: index("idx_ags_graph_edges_source_node").on(t.sourceNodeId),
    targetNodeIdx: index("idx_ags_graph_edges_target_node").on(t.targetNodeId),
    governanceIdx: index("idx_ags_graph_edges_governance").on(t.governanceStatus),
  }),
);

export const agsGraphNodeProperties = pgTable(
  "ags_graph_node_properties",
  {
    id: serial("id").primaryKey(),
    nodeId: integer("node_id").notNull().references(() => agsGraphNodes.id),
    propertyKey: varchar("property_key", { length: 100 }).notNull(),
    propertyValue: json("property_value").$type<unknown>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqueKey: uniqueIndex("idx_ags_graph_node_properties_unique").on(t.nodeId, t.propertyKey),
  }),
);

export const agsGraphEdgeProperties = pgTable(
  "ags_graph_edge_properties",
  {
    id: serial("id").primaryKey(),
    edgeId: integer("edge_id").notNull().references(() => agsGraphEdges.id),
    propertyKey: varchar("property_key", { length: 100 }).notNull(),
    propertyValue: json("property_value").$type<unknown>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqueKey: uniqueIndex("idx_ags_graph_edge_properties_unique").on(t.edgeId, t.propertyKey),
  }),
);

// ============================================================================
// Entities + entity resolution
// ============================================================================

export const agsGraphEntities = pgTable(
  "ags_graph_entities",
  {
    id: serial("id").primaryKey(),
    canonicalLabel: varchar("canonical_label", { length: 500 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    workspaceId: integer("workspace_id"),
    governanceStatus: varchar("governance_status", { length: 50 }).notNull().default("active"),
    sourceId: text("source_id"),
    sourceVersionId: text("source_version_id"),
    kgraEntityId: integer("kgra_entity_id"), // ref RAGDB.kgra_entities.id (cross-DB; logical only)
    confidence: numeric("confidence", { precision: 3, scale: 2 }).default("1.00"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    typeIdx: index("idx_ags_graph_entities_type").on(t.entityType),
    labelIdx: index("idx_ags_graph_entities_label").on(t.canonicalLabel),
    workspaceIdx: index("idx_ags_graph_entities_workspace").on(t.workspaceId),
    kgraIdx: index("idx_ags_graph_entities_kgra").on(t.kgraEntityId),
  }),
);

export const agsGraphEntityAliases = pgTable(
  "ags_graph_entity_aliases",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id").notNull().references(() => agsGraphEntities.id),
    aliasLabel: varchar("alias_label", { length: 500 }).notNull(),
    aliasSource: varchar("alias_source", { length: 100 }),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqueAlias: uniqueIndex("idx_ags_graph_entity_aliases_unique").on(t.entityId, t.aliasLabel),
  }),
);

export const agsGraphEntityResolutionCandidates = pgTable(
  "ags_graph_entity_resolution_candidates",
  {
    id: serial("id").primaryKey(),
    observedLabel: varchar("observed_label", { length: 500 }).notNull(),
    candidateEntityId: integer("candidate_entity_id"),
    matchScore: numeric("match_score", { precision: 3, scale: 2 }).notNull(),
    matchMethod: varchar("match_method", { length: 100 }),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    sourceNoteVersionId: integer("source_note_version_id"),
    reviewedByUserId: integer("reviewed_by_user_id"),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphEntityMergeDecisions = pgTable(
  "ags_graph_entity_merge_decisions",
  {
    id: serial("id").primaryKey(),
    primaryEntityId: integer("primary_entity_id").notNull().references(() => agsGraphEntities.id),
    mergedEntityId: integer("merged_entity_id").notNull().references(() => agsGraphEntities.id),
    decisionType: varchar("decision_type", { length: 50 }).notNull(),
    decidedByUserId: integer("decided_by_user_id"),
    rationale: text("rationale"),
    rollbackToken: text("rollback_token"),
    decidedAt: timestamp("decided_at").defaultNow().notNull(),
  },
);

export const agsGraphEntitySplitDecisions = pgTable(
  "ags_graph_entity_split_decisions",
  {
    id: serial("id").primaryKey(),
    sourceEntityId: integer("source_entity_id").notNull().references(() => agsGraphEntities.id),
    resultingEntityIds: json("resulting_entity_ids").$type<number[]>().notNull(),
    decidedByUserId: integer("decided_by_user_id"),
    rationale: text("rationale"),
    decidedAt: timestamp("decided_at").defaultNow().notNull(),
  },
);

export const agsGraphEntityResolutionAuditEvents = pgTable(
  "ags_graph_entity_resolution_audit_events",
  {
    id: serial("id").primaryKey(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    entityId: integer("entity_id"),
    candidateId: integer("candidate_id"),
    decisionId: integer("decision_id"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphEntityAutoMergePolicies = pgTable(
  "ags_graph_entity_auto_merge_policies",
  {
    id: serial("id").primaryKey(),
    policyKey: varchar("policy_key", { length: 100 }).notNull().unique(),
    workspaceId: integer("workspace_id"),
    entityType: varchar("entity_type", { length: 100 }),
    minMatchScore: numeric("min_match_score", { precision: 3, scale: 2 }).notNull().default("0.95"),
    requiredMatchMethods: json("required_match_methods").$type<string[]>(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

// ============================================================================
// Observations + temporal facts
// ============================================================================

export const agsGraphObservations = pgTable(
  "ags_graph_observations",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id").notNull().references(() => agsGraphEntities.id),
    observationType: varchar("observation_type", { length: 100 }).notNull(),
    observationValue: json("observation_value").$type<Record<string, unknown>>().notNull(),
    sourceType: varchar("source_type", { length: 100 }).notNull(),
    sourceId: text("source_id").notNull(),
    sourceVersionId: text("source_version_id"),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull().default("1.00"),
    validFrom: timestamp("valid_from").notNull(),
    validTo: timestamp("valid_to"),
    contradictedBy: integer("contradicted_by"),
    governanceStatus: varchar("governance_status", { length: 50 }).notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    entityIdx: index("idx_ags_graph_observations_entity").on(t.entityId),
    typeIdx: index("idx_ags_graph_observations_type").on(t.observationType),
  }),
);

export const agsGraphTemporalFacts = pgTable(
  "ags_graph_temporal_facts",
  {
    id: serial("id").primaryKey(),
    factKey: varchar("fact_key", { length: 255 }).notNull(),
    entityId: integer("entity_id").notNull().references(() => agsGraphEntities.id),
    factValue: json("fact_value").$type<Record<string, unknown>>().notNull(),
    validFrom: timestamp("valid_from").notNull(),
    validTo: timestamp("valid_to"),
    sourceObservationId: integer("source_observation_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

// ============================================================================
// Provenance + lineage
// ============================================================================

export const agsGraphProvenanceRecords = pgTable(
  "ags_graph_provenance_records",
  {
    id: serial("id").primaryKey(),
    targetTypeKey: varchar("target_type_key", { length: 100 }).notNull(),
    targetTypeKind: varchar("target_type_kind", { length: 50 }).notNull(),
    targetId: integer("target_id").notNull(),
    sourceType: varchar("source_type", { length: 100 }).notNull(),
    sourceId: text("source_id").notNull(),
    sourceVersionId: text("source_version_id"),
    sourceLocator: text("source_locator"),
    createdByUserId: integer("created_by_user_id"),
    createdByProcess: varchar("created_by_process", { length: 100 }),
    createdByAgentId: integer("created_by_agent_id"),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    lineageStatus: varchar("lineage_status", { length: 50 }).notNull(),
    extractionMethod: varchar("extraction_method", { length: 100 }),
    validationStatus: varchar("validation_status", { length: 50 }).notNull().default("unvalidated"),
    governanceStatus: varchar("governance_status", { length: 50 }).notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    validFrom: timestamp("valid_from").defaultNow().notNull(),
    validTo: timestamp("valid_to"),
  },
);

export const agsGraphLineageEvents = pgTable(
  "ags_graph_lineage_events",
  {
    id: serial("id").primaryKey(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    targetTypeKey: varchar("target_type_key", { length: 100 }).notNull(),
    targetId: integer("target_id").notNull(),
    predecessorTargetId: integer("predecessor_target_id"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

// ============================================================================
// Query cache + saved views + lens / layout
// ============================================================================

export const agsGraphQueryCache = pgTable(
  "ags_graph_query_cache",
  {
    id: serial("id").primaryKey(),
    cacheKey: varchar("cache_key", { length: 255 }).notNull().unique(),
    templateId: integer("template_id"),
    userRole: varchar("user_role", { length: 100 }),
    resultPayload: json("result_payload").$type<Record<string, unknown>>().notNull(),
    resultHash: varchar("result_hash", { length: 64 }).notNull(),
    hitCount: integer("hit_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    invalidatedAt: timestamp("invalidated_at"),
  },
);

export const agsGraphLayoutConfigs = pgTable(
  "ags_graph_layout_configs",
  {
    id: serial("id").primaryKey(),
    layoutKey: varchar("layout_key", { length: 100 }).notNull().unique(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    config: json("config").$type<Record<string, unknown>>().notNull(),
    defaultForLens: varchar("default_for_lens", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphLensConfigs = pgTable(
  "ags_graph_lens_configs",
  {
    id: serial("id").primaryKey(),
    lensKey: varchar("lens_key", { length: 100 }).notNull().unique(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    defaultLayoutKey: varchar("default_layout_key", { length: 100 }),
    defaultFilters: json("default_filters").$type<Record<string, unknown>>(),
    defaultStyles: json("default_styles").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsGraphSavedViews = pgTable(
  "ags_graph_saved_views",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id"),
    ownerUserId: integer("owner_user_id"),
    lensKey: varchar("lens_key", { length: 100 }),
    name: varchar("name", { length: 255 }).notNull(),
    config: json("config").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
);

export type AgsGraphNode = typeof agsGraphNodes.$inferSelect;
export type AgsGraphEdge = typeof agsGraphEdges.$inferSelect;
export type AgsGraphEntity = typeof agsGraphEntities.$inferSelect;
export type AgsGraphProvenanceRecord = typeof agsGraphProvenanceRecords.$inferSelect;
