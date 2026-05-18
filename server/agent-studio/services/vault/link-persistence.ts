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

  // ---- INSERT new rows ----
  let wikilinksWritten = 0;
  let embedsWritten = 0;

  if (extraction.wikilinks.length > 0) {
    const wikilinkRows = extraction.wikilinks.map((wl) => ({
      sourceNoteId: input.noteId,
      sourceVersionId: input.versionId,
      targetSlug: wl.targetSlug,
      targetNoteId: slugToNoteId.get(wl.targetSlug) ?? null,
      headingAnchor: wl.headingAnchor,
      alias: wl.alias,
      isEmbed: wl.isEmbed,
    }));
    const inserted = await db
      .insert(agsVaultWikilinks)
      .values(wikilinkRows)
      .returning({ id: agsVaultWikilinks.id });
    wikilinksWritten = inserted.length;
  }

  if (extraction.attachmentEmbeds.length > 0) {
    const embedRows = extraction.attachmentEmbeds.map((e) => ({
      sourceNoteId: input.noteId,
      sourceVersionId: input.versionId,
      embedKind: "attachment",
      targetNoteId: null,
      targetAttachmentId: null,
      targetSlug: e.filename,
    }));
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
