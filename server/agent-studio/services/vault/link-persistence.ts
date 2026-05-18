/**
 * Vault — outbound wikilink + embed persistence.
 *
 * Closes the last item on the #1477 / Phase 5b follow-on list: persist
 * `ags_vault_wikilinks` + `ags_vault_embeds` rows on every note version
 * create / update. Before this module the link extraction ran (#1477
 * router hook computed `wikilinkCount` / `tagCount` for the response)
 * but the resolved rows were thrown away. The WikilinksBacklinksPanel
 * compensated by shipping all-vault markdown to the client and
 * re-extracting there.
 *
 * With this module:
 *   - `[[Note]]` / `[[Note#Anchor]]` / `[[Note|Alias]]` → one row in
 *     `ags_vault_wikilinks` per resolved target. Unresolved wikilinks
 *     still get rows (targetNoteId=null) for the future
 *     unlinked-mentions UX.
 *   - `![[image.png]]` → one row in `ags_vault_embeds` with
 *     `embedKind="attachment"`. (Note-embeds `![[OtherNote]]` need a
 *     separate writer that resolves against the vault slug map; this
 *     PR handles the attachment-shape only — the simpler case — and
 *     leaves note-embeds for a follow-on since the embed table allows
 *     both shapes via nullable target_note_id / target_attachment_id.)
 *
 * Persistence strategy: REPLACE on every version. Wikilinks +
 * embeds are derived data; we DELETE rows for the previous version
 * then INSERT for the new one. This is idempotent + cheap (links per
 * note are bounded), and preserves the invariant that
 * `ags_vault_wikilinks` at any moment shows exactly the wikilinks
 * from the LATEST note version, never stale ones.
 *
 * Failure mode: fire-and-forget from the router. A persist failure
 * logs a warning but does NOT roll back the DB mutation (the graph
 * projection job already enqueued the link payload separately, so the
 * Neo4j projection still happens even if Postgres link persistence
 * fails).
 */

import { eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsVaultWikilinks,
  agsVaultEmbeds,
} from "../../../../drizzle/tables/agent-studio-vault.js";
import { extractLinksFromMarkdown } from "./links.js";
import type { VaultRepository } from "./repository.js";

export interface PersistLinksInput {
  readonly vaultId: number;
  readonly noteId: number;
  readonly versionId: number;
  readonly contentMd: string;
  readonly repo: VaultRepository;
}

export interface PersistLinksResult {
  readonly wikilinksWritten: number;
  readonly embedsWritten: number;
  readonly wikilinksDeleted: number;
  readonly embedsDeleted: number;
}

/**
 * Persists outbound wikilinks + attachment-embeds for a note version.
 * REPLACES the prior wikilink/embed rows for the note (not the
 * version — the latest version is the only one with live rows).
 */
export async function persistNoteLinks(
  input: PersistLinksInput,
): Promise<PersistLinksResult> {
  const db = getAsDb();
  if (!db) {
    return {
      wikilinksWritten: 0,
      embedsWritten: 0,
      wikilinksDeleted: 0,
      embedsDeleted: 0,
    };
  }

  const extraction = extractLinksFromMarkdown(input.contentMd);

  // Resolve targetSlug → noteId via the vault's slug map. The same
  // map the graph-projection module uses; intentionally not shared
  // (each pass loads a fresh view of the vault).
  const peers = await input.repo.listNotesInVault(input.vaultId, {
    limit: 10_000,
  });
  const slugToNoteId = new Map<string, number>();
  for (const p of peers) {
    slugToNoteId.set(p.slug, p.id);
  }

  // ---- REPLACE strategy: clear previous version's rows ----
  const deletedWikilinks = await db
    .delete(agsVaultWikilinks)
    .where(eq(agsVaultWikilinks.sourceNoteId, input.noteId))
    .returning({ id: agsVaultWikilinks.id });
  const deletedEmbeds = await db
    .delete(agsVaultEmbeds)
    .where(eq(agsVaultEmbeds.sourceNoteId, input.noteId))
    .returning({ id: agsVaultEmbeds.id });

  // ---- Classify extraction by destination table ----
  // `[[Note]]` and `[[Note|Alias]]` → ags_vault_wikilinks (real link)
  // `![[Note]]` (no extension) → ags_vault_embeds (embedKind="note")
  // `![[image.png]]` (extension) → ags_vault_embeds (embedKind="attachment")
  //
  // Pre-PR behavior had note-shape embeds going to ags_vault_wikilinks
  // with `isEmbed=true`, leaving the embeds table empty for the most
  // common embed shape. The cleaner classification: each row in
  // exactly ONE table, queried by its semantic shape.
  const realWikilinks = extraction.wikilinks.filter((wl) => !wl.isEmbed);
  const noteEmbeds = extraction.wikilinks.filter((wl) => wl.isEmbed);

  // ---- INSERT new rows ----
  let wikilinksWritten = 0;
  let embedsWritten = 0;

  if (realWikilinks.length > 0) {
    const wikilinkRows = realWikilinks.map((wl) => ({
      sourceNoteId: input.noteId,
      sourceVersionId: input.versionId,
      targetSlug: wl.targetSlug,
      targetNoteId: slugToNoteId.get(wl.targetSlug) ?? null,
      headingAnchor: wl.headingAnchor,
      alias: wl.alias,
      isEmbed: false,
    }));
    const inserted = await db
      .insert(agsVaultWikilinks)
      .values(wikilinkRows)
      .returning({ id: agsVaultWikilinks.id });
    wikilinksWritten = inserted.length;
  }

  const embedRows: Array<{
    sourceNoteId: number;
    sourceVersionId: number;
    embedKind: "attachment" | "note";
    targetNoteId: number | null;
    targetAttachmentId: number | null;
    targetSlug: string;
  }> = [
    ...extraction.attachmentEmbeds.map((e) => ({
      sourceNoteId: input.noteId,
      sourceVersionId: input.versionId,
      embedKind: "attachment" as const,
      targetNoteId: null,
      targetAttachmentId: null,
      targetSlug: e.filename,
    })),
    ...noteEmbeds.map((wl) => ({
      sourceNoteId: input.noteId,
      sourceVersionId: input.versionId,
      embedKind: "note" as const,
      targetNoteId: slugToNoteId.get(wl.targetSlug) ?? null,
      targetAttachmentId: null,
      targetSlug: wl.targetSlug,
    })),
  ];

  if (embedRows.length > 0) {
    const inserted = await db
      .insert(agsVaultEmbeds)
      .values(embedRows)
      .returning({ id: agsVaultEmbeds.id });
    embedsWritten = inserted.length;
  }

  return {
    wikilinksWritten,
    embedsWritten,
    wikilinksDeleted: deletedWikilinks.length,
    embedsDeleted: deletedEmbeds.length,
  };
}

// ---------------------------------------------------------------------------
// Backfill
// ---------------------------------------------------------------------------

export interface BackfillVaultLinksInput {
  readonly vaultId: number;
  readonly repo: VaultRepository;
  /** Cap per pass. Default 1000. */
  readonly limit?: number;
  /** Test seam — replace `persistNoteLinks` with a stub. */
  readonly persistFn?: (input: PersistLinksInput) => Promise<PersistLinksResult>;
}

export interface BackfillVaultLinksResult {
  readonly notesProcessed: number;
  readonly notesSkipped: number;
  readonly wikilinksWritten: number;
  readonly embedsWritten: number;
  readonly errors: Array<{ noteId: number; error: string }>;
}

/**
 * One-shot backfill — runs `persistNoteLinks` for every note in the
 * vault using its latest version's contentMd. Use cases:
 *   - Vault existed before #1482 (link extraction was running but
 *     rows were never written); operator triggers backfill once to
 *     populate the tables.
 *   - Operator suspects link drift (rare but possible if an out-of-
 *     band edit bypassed the router hooks); backfill re-derives.
 *
 * Idempotent — each note's wikilink/embed rows are REPLACED by the
 * persistNoteLinks delete-then-insert pattern. Safe to re-run.
 *
 * Failure-tolerance: per-note exceptions are caught and recorded in
 * `errors[]`; the backfill continues. One bad note doesn't poison
 * the whole pass.
 */
export async function backfillVaultLinks(
  input: BackfillVaultLinksInput,
): Promise<BackfillVaultLinksResult> {
  const limit = input.limit ?? 1000;
  const persistFn = input.persistFn ?? persistNoteLinks;
  const notes = await input.repo.listNotesInVault(input.vaultId, { limit });

  let notesProcessed = 0;
  let notesSkipped = 0;
  let wikilinksWritten = 0;
  let embedsWritten = 0;
  const errors: Array<{ noteId: number; error: string }> = [];

  for (const note of notes) {
    try {
      const latest = await input.repo.getLatestNoteVersion(note.id);
      if (!latest) {
        notesSkipped++;
        continue;
      }
      const result = await persistFn({
        vaultId: input.vaultId,
        noteId: note.id,
        versionId: latest.id,
        contentMd: latest.contentMd,
        repo: input.repo,
      });
      notesProcessed++;
      wikilinksWritten += result.wikilinksWritten;
      embedsWritten += result.embedsWritten;
    } catch (e) {
      errors.push({
        noteId: note.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    notesProcessed,
    notesSkipped,
    wikilinksWritten,
    embedsWritten,
    errors,
  };
}
