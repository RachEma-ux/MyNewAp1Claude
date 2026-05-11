/**
 * Agent Studio Native Graph Workspace — Vault tables.
 *
 * Phase 2 / 2.5 / 4 / 5 enabling tables. ASDB-resident.
 *
 * ADR: docs/architecture/agent-studio-markdown-profile.md
 * ADR: docs/architecture/agent-studio-note-metadata-domain-model.md
 * ADR: docs/architecture/agent-studio-shared-vault-editing-locks.md
 *
 * Drizzle reconciler picks these up via the existing reconciler boot path.
 * No SQL migrations required — `ALTER TABLE ADD COLUMN IF NOT EXISTS` semantics
 * apply.
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

// ============================================================================
// Vaults + membership
// ============================================================================

export const agsVaults = pgTable(
  "ags_vaults",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id"),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    description: text("description"),
    createdByUserId: integer("created_by_user_id"),
    settings: json("settings").$type<Record<string, unknown>>(),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex("idx_ags_vaults_slug").on(t.workspaceId, t.slug),
    workspaceIdx: index("idx_ags_vaults_workspace").on(t.workspaceId),
  }),
);

export const agsVaultMembers = pgTable(
  "ags_vault_members",
  {
    id: serial("id").primaryKey(),
    vaultId: integer("vault_id").notNull().references(() => agsVaults.id),
    userId: integer("user_id").notNull(),
    role: varchar("role", { length: 50 }).notNull().default("reader"), // reader | writer | admin
    addedByUserId: integer("added_by_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqueMember: uniqueIndex("idx_ags_vault_members_unique").on(t.vaultId, t.userId),
  }),
);

// ============================================================================
// Folders + notes
// ============================================================================

export const agsVaultFolders = pgTable(
  "ags_vault_folders",
  {
    id: serial("id").primaryKey(),
    vaultId: integer("vault_id").notNull().references(() => agsVaults.id),
    parentFolderId: integer("parent_folder_id"),
    name: varchar("name", { length: 255 }).notNull(),
    path: text("path").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    vaultIdx: index("idx_ags_vault_folders_vault").on(t.vaultId),
    pathIdx: index("idx_ags_vault_folders_path").on(t.path),
  }),
);

export const agsVaultNotes = pgTable(
  "ags_vault_notes",
  {
    id: serial("id").primaryKey(),
    vaultId: integer("vault_id").notNull().references(() => agsVaults.id),
    folderId: integer("folder_id"),
    slug: varchar("slug", { length: 255 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    currentVersionId: integer("current_version_id"),
    governanceStatus: varchar("governance_status", { length: 50 }).notNull().default("active"),
    createdByUserId: integer("created_by_user_id"),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex("idx_ags_vault_notes_slug").on(t.vaultId, t.slug),
    vaultIdx: index("idx_ags_vault_notes_vault").on(t.vaultId),
    folderIdx: index("idx_ags_vault_notes_folder").on(t.folderId),
    governanceIdx: index("idx_ags_vault_notes_governance").on(t.governanceStatus),
  }),
);

export const agsVaultNoteVersions = pgTable(
  "ags_vault_note_versions",
  {
    id: serial("id").primaryKey(),
    noteId: integer("note_id").notNull().references(() => agsVaultNotes.id),
    version: integer("version").notNull(),
    contentMd: text("content_md").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    frontmatter: json("frontmatter").$type<Record<string, unknown>>(),
    authorUserId: integer("author_user_id"),
    commitMessage: text("commit_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    noteIdx: index("idx_ags_vault_note_versions_note").on(t.noteId),
    versionIdx: uniqueIndex("idx_ags_vault_note_versions_version").on(t.noteId, t.version),
    hashIdx: index("idx_ags_vault_note_versions_hash").on(t.contentHash),
  }),
);

export const agsVaultNoteConflicts = pgTable(
  "ags_vault_note_conflicts",
  {
    id: serial("id").primaryKey(),
    noteId: integer("note_id").notNull().references(() => agsVaultNotes.id),
    detectedAt: timestamp("detected_at").defaultNow().notNull(),
    expectedVersion: integer("expected_version").notNull(),
    submittedVersion: integer("submitted_version").notNull(),
    submitterUserId: integer("submitter_user_id"),
    resolution: varchar("resolution", { length: 50 }),
    resolvedAt: timestamp("resolved_at"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    noteIdx: index("idx_ags_vault_note_conflicts_note").on(t.noteId),
  }),
);

// ============================================================================
// Edit sessions + soft locks
// ============================================================================

export const agsVaultNoteEditSessions = pgTable(
  "ags_vault_note_edit_sessions",
  {
    id: serial("id").primaryKey(),
    noteId: integer("note_id").notNull().references(() => agsVaultNotes.id),
    userId: integer("user_id").notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    lastActiveAt: timestamp("last_active_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
  },
  (t) => ({
    noteIdx: index("idx_ags_vault_note_edit_sessions_note").on(t.noteId),
    userIdx: index("idx_ags_vault_note_edit_sessions_user").on(t.userId),
  }),
);

export const agsVaultNoteLocks = pgTable(
  "ags_vault_note_locks",
  {
    id: serial("id").primaryKey(),
    noteId: integer("note_id").notNull().references(() => agsVaultNotes.id),
    userId: integer("user_id").notNull(),
    acquiredAt: timestamp("acquired_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    releasedAt: timestamp("released_at"),
  },
  (t) => ({
    noteIdx: index("idx_ags_vault_note_locks_note").on(t.noteId),
    activeIdx: index("idx_ags_vault_note_locks_active").on(t.noteId, t.releasedAt),
  }),
);

export const agsVaultNoteConflictResolutions = pgTable(
  "ags_vault_note_conflict_resolutions",
  {
    id: serial("id").primaryKey(),
    noteId: integer("note_id").notNull().references(() => agsVaultNotes.id),
    conflictKind: varchar("conflict_kind", { length: 50 }).notNull(),
    loserVersionId: integer("loser_version_id"),
    winnerVersionId: integer("winner_version_id"),
    resolution: varchar("resolution", { length: 50 }).notNull(),
    resolvedByUserId: integer("resolved_by_user_id"),
    resolvedAt: timestamp("resolved_at").defaultNow().notNull(),
    metadata: json("metadata").$type<Record<string, unknown>>(),
  },
);

// ============================================================================
// Attachments + trash
// ============================================================================

export const agsVaultAttachments = pgTable(
  "ags_vault_attachments",
  {
    id: serial("id").primaryKey(),
    vaultId: integer("vault_id").notNull().references(() => agsVaults.id),
    noteId: integer("note_id"),
    filename: varchar("filename", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageUri: text("storage_uri").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    createdByUserId: integer("created_by_user_id"),
    // Phase 15 — flagging an attachment as a source artifact makes it
    // eligible for the Universal Ingestion / RAC source-registry
    // pipeline. The flag lives here so a single operator action can
    // toggle it without standing up a separate registry row; the
    // ingestion pipeline reads this column when scanning the vault
    // for new source candidates.
    isSourceArtifact: boolean("is_source_artifact").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    vaultIdx: index("idx_ags_vault_attachments_vault").on(t.vaultId),
    noteIdx: index("idx_ags_vault_attachments_note").on(t.noteId),
    hashIdx: index("idx_ags_vault_attachments_hash").on(t.contentHash),
  }),
);

export const agsVaultTrash = pgTable(
  "ags_vault_trash",
  {
    id: serial("id").primaryKey(),
    vaultId: integer("vault_id").notNull().references(() => agsVaults.id),
    sourceKind: varchar("source_kind", { length: 50 }).notNull(),
    sourceId: integer("source_id").notNull(),
    payload: json("payload").$type<Record<string, unknown>>(),
    deletedByUserId: integer("deleted_by_user_id"),
    deletedAt: timestamp("deleted_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
  },
);

export const agsVaultSettings = pgTable(
  "ags_vault_settings",
  {
    id: serial("id").primaryKey(),
    vaultId: integer("vault_id").notNull().references(() => agsVaults.id).unique(),
    settings: json("settings").$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
);

// ============================================================================
// Properties / frontmatter
// ============================================================================

export const agsVaultPropertyDomains = pgTable(
  "ags_vault_property_domains",
  {
    id: serial("id").primaryKey(),
    domainKey: varchar("domain_key", { length: 50 }).notNull().unique(),
    description: text("description"),
    userEditable: boolean("user_editable").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsVaultPropertyDefinitions = pgTable(
  "ags_vault_property_definitions",
  {
    id: serial("id").primaryKey(),
    propertyKey: varchar("property_key", { length: 255 }).notNull().unique(),
    propertyType: varchar("property_type", { length: 50 }).notNull(),
    domain: varchar("domain", { length: 50 }).notNull(),
    userEditable: boolean("user_editable").notNull().default(true),
    validationRegex: text("validation_regex"),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsVaultNoteProperties = pgTable(
  "ags_vault_note_properties",
  {
    id: serial("id").primaryKey(),
    noteId: integer("note_id").notNull().references(() => agsVaultNotes.id),
    propertyKey: varchar("property_key", { length: 255 }).notNull(),
    propertyType: varchar("property_type", { length: 50 }).notNull(),
    propertyValue: json("property_value").$type<unknown>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    notePropertyIdx: uniqueIndex("idx_ags_vault_note_properties_unique").on(t.noteId, t.propertyKey),
    noteIdx: index("idx_ags_vault_note_properties_note").on(t.noteId),
  }),
);

// ============================================================================
// Tags + wikilinks + backlinks + embeds
// ============================================================================

export const agsVaultTags = pgTable(
  "ags_vault_tags",
  {
    id: serial("id").primaryKey(),
    vaultId: integer("vault_id").notNull().references(() => agsVaults.id),
    label: varchar("label", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqueTag: uniqueIndex("idx_ags_vault_tags_unique").on(t.vaultId, t.label),
  }),
);

export const agsVaultWikilinks = pgTable(
  "ags_vault_wikilinks",
  {
    id: serial("id").primaryKey(),
    sourceNoteId: integer("source_note_id").notNull().references(() => agsVaultNotes.id),
    sourceVersionId: integer("source_version_id"),
    targetSlug: varchar("target_slug", { length: 255 }).notNull(),
    targetNoteId: integer("target_note_id"),
    headingAnchor: varchar("heading_anchor", { length: 255 }),
    alias: varchar("alias", { length: 255 }),
    isEmbed: boolean("is_embed").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    sourceIdx: index("idx_ags_vault_wikilinks_source").on(t.sourceNoteId),
    targetIdx: index("idx_ags_vault_wikilinks_target").on(t.targetNoteId),
    targetSlugIdx: index("idx_ags_vault_wikilinks_target_slug").on(t.targetSlug),
  }),
);

export const agsVaultBacklinks = pgTable(
  "ags_vault_backlinks",
  {
    id: serial("id").primaryKey(),
    targetNoteId: integer("target_note_id").notNull().references(() => agsVaultNotes.id),
    sourceNoteId: integer("source_note_id").notNull().references(() => agsVaultNotes.id),
    sourceVersionId: integer("source_version_id"),
    wikilinkId: integer("wikilink_id"),
    contextSnippet: text("context_snippet"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    targetIdx: index("idx_ags_vault_backlinks_target").on(t.targetNoteId),
    sourceIdx: index("idx_ags_vault_backlinks_source").on(t.sourceNoteId),
  }),
);

export const agsVaultUnlinkedMentions = pgTable(
  "ags_vault_unlinked_mentions",
  {
    id: serial("id").primaryKey(),
    noteId: integer("note_id").notNull().references(() => agsVaultNotes.id),
    mentionedTitle: varchar("mentioned_title", { length: 500 }).notNull(),
    contextSnippet: text("context_snippet"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsVaultEmbeds = pgTable(
  "ags_vault_embeds",
  {
    id: serial("id").primaryKey(),
    sourceNoteId: integer("source_note_id").notNull().references(() => agsVaultNotes.id),
    sourceVersionId: integer("source_version_id"),
    embedKind: varchar("embed_kind", { length: 50 }).notNull(),
    targetNoteId: integer("target_note_id"),
    targetAttachmentId: integer("target_attachment_id"),
    targetSlug: varchar("target_slug", { length: 500 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsVaultEntityMentions = pgTable(
  "ags_vault_entity_mentions",
  {
    id: serial("id").primaryKey(),
    noteId: integer("note_id").notNull().references(() => agsVaultNotes.id),
    versionId: integer("version_id"),
    entityId: integer("entity_id"),
    mentionLabel: varchar("mention_label", { length: 500 }).notNull(),
    confidence: varchar("confidence", { length: 10 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

// ============================================================================
// Templates + saved views
// ============================================================================

export const agsVaultTemplates = pgTable(
  "ags_vault_templates",
  {
    id: serial("id").primaryKey(),
    vaultId: integer("vault_id"),
    templateKey: varchar("template_key", { length: 100 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    contentMd: text("content_md").notNull(),
    frontmatterDefaults: json("frontmatter_defaults").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const agsVaultSavedViews = pgTable(
  "ags_vault_saved_views",
  {
    id: serial("id").primaryKey(),
    vaultId: integer("vault_id").notNull().references(() => agsVaults.id),
    ownerUserId: integer("owner_user_id"),
    name: varchar("name", { length: 255 }).notNull(),
    viewKind: varchar("view_kind", { length: 50 }).notNull(),
    filters: json("filters").$type<Record<string, unknown>>(),
    sort: json("sort").$type<Record<string, unknown>>(),
    columns: json("columns").$type<string[]>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
);

export type AgsVault = typeof agsVaults.$inferSelect;
export type AgsVaultMember = typeof agsVaultMembers.$inferSelect;
export type AgsVaultNote = typeof agsVaultNotes.$inferSelect;
export type AgsVaultNoteVersion = typeof agsVaultNoteVersions.$inferSelect;
export type AgsVaultWikilink = typeof agsVaultWikilinks.$inferSelect;
export type AgsVaultBacklink = typeof agsVaultBacklinks.$inferSelect;
