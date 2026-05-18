/**
 * Vault — DB-backed link queries.
 *
 * Companion module to `link-persistence.ts` (#1482): now that the
 * link tables are populated on every note version write, operators
 * can query them directly instead of shipping all-vault markdown to
 * the client + re-parsing. These queries are the keystone for
 * migrating `WikilinksBacklinksPanel` off live parsing.
 *
 *   - `listBacklinksForNote(noteId)` — returns notes that link TO
 *     the given note (backlinks). Equivalent to scanning every peer's
 *     contentMd for `[[<targetSlug>]]`, but in one indexed query.
 *   - `listOutgoingWikilinksForNote(noteId)` — returns the
 *     wikilinks FROM the given note. Cheap, but normalized into the
 *     same envelope so the panel can render both sides the same way.
 *
 * Returns are deduplicated by sourceNoteId / targetNoteId; the same
 * source-target pair appears once even if the source's contentMd
 * references it multiple times.
 */

import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsVaultNotes,
  agsVaultWikilinks,
} from "../../../../drizzle/tables/agent-studio-vault.js";

export interface BacklinkRow {
  readonly sourceNoteId: number;
  readonly sourceSlug: string;
  readonly sourceTitle: string;
  readonly sourceVersionId: number | null;
}

export interface OutgoingWikilinkRow {
  readonly targetNoteId: number | null;
  readonly targetSlug: string;
  readonly targetTitle: string | null;
  readonly alias: string | null;
  readonly headingAnchor: string | null;
}

/**
 * Notes that reference the given note via `[[<this-note's-slug>]]`.
 * Backed by `ags_vault_wikilinks` (populated by #1482 on every
 * createNote/updateNote). Returns empty array when ASDB is
 * unavailable (degraded mode).
 */
export async function listBacklinksForNote(
  noteId: number,
): Promise<BacklinkRow[]> {
  const db = getAsDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({
      sourceNoteId: agsVaultWikilinks.sourceNoteId,
      sourceSlug: agsVaultNotes.slug,
      sourceTitle: agsVaultNotes.title,
      sourceVersionId: agsVaultWikilinks.sourceVersionId,
    })
    .from(agsVaultWikilinks)
    .innerJoin(
      agsVaultNotes,
      eq(agsVaultNotes.id, agsVaultWikilinks.sourceNoteId),
    )
    .where(eq(agsVaultWikilinks.targetNoteId, noteId))
    .orderBy(desc(agsVaultNotes.updatedAt));
  return rows.map((r) => ({
    sourceNoteId: Number(r.sourceNoteId),
    sourceSlug: String(r.sourceSlug),
    sourceTitle: String(r.sourceTitle),
    sourceVersionId:
      r.sourceVersionId == null ? null : Number(r.sourceVersionId),
  }));
}

/**
 * Outgoing wikilinks from the given note. Backed by
 * `ags_vault_wikilinks WHERE sourceNoteId = X`. Joins to
 * `ags_vault_notes` to surface the target's title (where the link
 * resolved). Unresolved targets surface as `targetNoteId=null`,
 * `targetTitle=null`.
 */
export async function listOutgoingWikilinksForNote(
  noteId: number,
): Promise<OutgoingWikilinkRow[]> {
  const db = getAsDb();
  if (!db) return [];
  // LEFT JOIN: resolved + unresolved wikilinks both surface.
  const rows = await db
    .select({
      targetNoteId: agsVaultWikilinks.targetNoteId,
      targetSlug: agsVaultWikilinks.targetSlug,
      targetTitle: agsVaultNotes.title,
      alias: agsVaultWikilinks.alias,
      headingAnchor: agsVaultWikilinks.headingAnchor,
    })
    .from(agsVaultWikilinks)
    .leftJoin(
      agsVaultNotes,
      and(
        isNotNull(agsVaultWikilinks.targetNoteId),
        eq(agsVaultNotes.id, agsVaultWikilinks.targetNoteId),
      ),
    )
    .where(eq(agsVaultWikilinks.sourceNoteId, noteId));
  return rows.map((r) => ({
    targetNoteId: r.targetNoteId == null ? null : Number(r.targetNoteId),
    targetSlug: String(r.targetSlug),
    targetTitle: r.targetTitle == null ? null : String(r.targetTitle),
    alias: r.alias == null ? null : String(r.alias),
    headingAnchor: r.headingAnchor == null ? null : String(r.headingAnchor),
  }));
}
