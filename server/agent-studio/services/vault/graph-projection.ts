/**
 * Vault — Knowledge Graph projection bridge.
 *
 * Closes step 8 of the Phase 5b note-version pipeline (documented in
 * public-api.ts:194-208 but never wired): every createNote / updateNote
 * pushes the note onto the `ags_graph_projection_sync_jobs` queue, and
 * one sync-job per resolved `[[wikilink]]`. The Phase 7.5 sync-worker
 * already knows how to render these event kinds into Neo4j upserts
 * (sync-worker.ts:120-164):
 *
 *   - `note.created` / `note.updated` → upsert {Note, NoteVersion}
 *     nodes + a VERSION_OF edge.
 *   - `wikilink.changed` → upsert a LINKS_TO edge from the
 *     NoteVersion to the target Note (when the targetSlug resolves
 *     against the vault's slug map; unresolved wikilinks are skipped
 *     here and surface in the WikilinksBacklinksPanel's broken-links
 *     section instead).
 *
 * Resolution strategy: load every active note in the vault, build a
 * slug→noteId map, look each extracted wikilink's targetSlug up. This
 * is the same slug map the search.ts module already builds (vault-
 * scoped, modest cardinality at MVP scale). Unresolved targets emit
 * no projection job — they're noise until the target note is created,
 * at which point the inbound-resolution backfill (follow-on slice)
 * will pick them up.
 *
 * Failure mode: fire-and-forget from the router (same pattern as the
 * Track A FS-sync flush). A projection-queue failure logs a warning
 * but never rolls back the DB mutation.
 */

import type { VaultRepository } from "./repository.js";
import { extractLinksFromMarkdown } from "./links.js";
import { getGraphRepository } from "../graph/repository/index.js";
import type { GraphRepository } from "../graph/repository/types.js";

export type VaultNoteEventKind = "note.created" | "note.updated";

export interface EnqueueVaultNoteProjectionInput {
  readonly vaultId: number;
  readonly noteId: number;
  readonly versionId: number;
  readonly slug: string;
  readonly title: string;
  readonly contentMd: string;
  readonly eventKind: VaultNoteEventKind;
}

export interface EnqueueVaultNoteProjectionOptions {
  readonly repo?: VaultRepository;
  readonly graphRepo?: GraphRepository;
}

export interface EnqueueVaultNoteProjectionResult {
  readonly noteJobId: number;
  readonly wikilinkJobIds: number[];
  readonly unresolvedSlugs: string[];
}

/**
 * Pushes one note-level projection job + N wikilink-level jobs onto
 * the shared `ags_graph_projection_sync_jobs` queue. Caller is
 * expected to fire-and-forget — failure-tolerant by design.
 */
export async function enqueueVaultNoteProjection(
  input: EnqueueVaultNoteProjectionInput,
  options: EnqueueVaultNoteProjectionOptions = {},
): Promise<EnqueueVaultNoteProjectionResult> {
  const repo = options.repo;
  if (repo == null) {
    throw new Error(
      "[vault-graph-projection] repo must be supplied (router passes getRepo())",
    );
  }
  const graphRepo = options.graphRepo ?? getGraphRepository();

  const notePayload = {
    noteId: input.noteId,
    versionId: input.versionId,
    slug: input.slug,
    title: input.title,
    vaultId: input.vaultId,
  };

  const noteJob = await graphRepo.enqueueProjectionJob({
    projectionKey: `vault_note:${input.noteId}`,
    triggerEvent: input.eventKind,
    triggerPayload: notePayload,
  });

  const extraction = extractLinksFromMarkdown(input.contentMd);
  if (extraction.wikilinks.length === 0) {
    return {
      noteJobId: noteJob.jobId,
      wikilinkJobIds: [],
      unresolvedSlugs: [],
    };
  }

  // Resolve targetSlug → noteId against the vault's slug map. Drops
  // self-links and unresolved targets; the sync-worker also guards
  // against null targetNoteId (sync-worker.ts:153), but skipping here
  // keeps the queue clean of no-op rows.
  const peers = await repo.listNotesInVault(input.vaultId, { limit: 10_000 });
  const slugToNoteId = new Map<string, number>();
  for (const p of peers) {
    slugToNoteId.set(p.slug, p.id);
  }

  const wikilinkJobIds: number[] = [];
  const unresolvedSlugs: string[] = [];
  const seenSlugs = new Set<string>();
  for (const wl of extraction.wikilinks) {
    if (seenSlugs.has(wl.targetSlug)) continue;
    seenSlugs.add(wl.targetSlug);
    const targetNoteId = slugToNoteId.get(wl.targetSlug);
    if (targetNoteId == null || targetNoteId === input.noteId) {
      if (targetNoteId == null) unresolvedSlugs.push(wl.targetSlug);
      continue;
    }
    const job = await graphRepo.enqueueProjectionJob({
      projectionKey: `vault_wikilink:${input.versionId}:${wl.targetSlug}`,
      triggerEvent: "wikilink.changed",
      triggerPayload: {
        sourceVersionId: input.versionId,
        targetSlug: wl.targetSlug,
        targetNoteId,
      },
    });
    wikilinkJobIds.push(job.jobId);
  }

  return {
    noteJobId: noteJob.jobId,
    wikilinkJobIds,
    unresolvedSlugs,
  };
}
