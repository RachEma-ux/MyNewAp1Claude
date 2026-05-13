/**
 * Agent Studio Vault — template-instantiation ledger.
 *
 * V1+ Phase 15-α first slice. ASDB-resident.
 *
 * Records which template a note was created from. This supports:
 *   1. **Refactor-safety**: when a template is updated, operators
 *      can find every note that was instantiated from the previous
 *      version (queryable by `templateId` + `templateVersionDigest`).
 *   2. **Audit**: the V1+ plan's Phase 15-α acceptance criterion #2
 *      requires "tracks which note was created from which template".
 *   3. **Quota/budget reporting** (V1.5+): per-workspace template
 *      adoption stats roll up from this ledger.
 *
 * Design:
 *   - One row per instantiation event. Notes can be deleted; the
 *     instantiation row survives for audit purposes — so we use
 *     soft FK semantics (no `onDelete: cascade`) and a
 *     `noteVersionId` snapshot so the original payload reference
 *     survives a note rename.
 *   - `templateVersionDigest` is a hash of the template content at
 *     instantiation time. When the template content changes, the
 *     digest changes; old instantiations keep their original digest.
 *   - `instantiatedByUserId` is nullable because some templates
 *     are applied by system jobs (e.g. workspace bootstrap), not
 *     a logged-in user.
 *
 * Hard-rule compliance:
 *   - No graph mutation — this is metadata about the source vault
 *     surface; it does not project into Neo4j.
 *   - Postgres = source of truth.
 *
 * ADR: V1+ execution plan §"Phase 15 — Templates / Attachments".
 */

import {
  index,
  integer,
  json,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const agsVaultTemplateInstantiations = pgTable(
  "ags_vault_template_instantiations",
  {
    id: serial("id").primaryKey(),
    /** FK to `ags_vault_templates.id` — soft (no cascade) so audit
     *  rows survive template deletion. */
    templateId: integer("template_id").notNull(),
    /** FK to `ags_vault_notes.id` — soft (no cascade). */
    noteId: integer("note_id").notNull(),
    /** Frozen `ags_vault_note_versions.id` reference for the
     *  initial version produced from the template. Nullable for
     *  template applications that immediately superseded their own
     *  first version (rare). */
    noteVersionId: integer("note_version_id"),
    /** Sha-256 hex digest of the template content at instantiation
     *  time. Refactor anchor — when the template content changes,
     *  the digest changes; existing rows keep their original digest
     *  so operators can find pre-update instantiations. */
    templateVersionDigest: varchar("template_version_digest", { length: 64 })
      .notNull(),
    /** Optional: who instantiated. Null for system-driven applies. */
    instantiatedByUserId: integer("instantiated_by_user_id"),
    /** Optional context payload — applied frontmatter overrides,
     *  source workflow id, etc. */
    context: json("context"),
    instantiatedAt: timestamp("instantiated_at").defaultNow().notNull(),
  },
  (t) => ({
    templateIdx: index("idx_ags_vault_template_inst_template").on(t.templateId),
    noteIdx: index("idx_ags_vault_template_inst_note").on(t.noteId),
    digestIdx: index("idx_ags_vault_template_inst_digest").on(
      t.templateVersionDigest,
    ),
    instantiatedAtIdx: index("idx_ags_vault_template_inst_at").on(
      t.instantiatedAt,
    ),
  }),
);

export type AgsVaultTemplateInstantiation =
  typeof agsVaultTemplateInstantiations.$inferSelect;
export type NewAgsVaultTemplateInstantiation =
  typeof agsVaultTemplateInstantiations.$inferInsert;
