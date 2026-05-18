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

/**
 * Enqueues a `note.deleted` projection job. No content / wikilink
 * extraction — the sync-worker's `note.deleted` case purges the Note
 * (and DETACH-cascades the NoteVersion + LINKS_TO + VERSION_OF
 * edges) from Neo4j. Mirrors `enqueueVaultNoteProjection`'s
 * fire-and-forget contract.
 */
export interface EnqueueVaultNoteDeletionInput {
  readonly noteId: number;
}

export async function enqueueVaultNoteDeletion(
  input: EnqueueVaultNoteDeletionInput,
  options: { graphRepo?: GraphRepository } = {},
): Promise<{ jobId: number }> {
  const graphRepo = options.graphRepo ?? getGraphRepository();
  return graphRepo.enqueueProjectionJob({
    projectionKey: `vault_note:${input.noteId}`,
    triggerEvent: "note.deleted",
    triggerPayload: { noteId: input.noteId },
  });
}

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
  /**
   * Number of wikilink.changed jobs enqueued by the inbound-resolution
   * backfill — peers that referenced this note via `[[<slug>]]` BEFORE
   * the note was created. Always 0 for `eventKind === "note.updated"`
   * (no slug change on update; old peer wikilinks already resolve).
   */
  readonly inboundBackfilledCount: number;
}

const WIKILINK_RE = /\[\[([^\]\n]+?)\]\]/g;

/**
 * Returns true iff `contentMd` contains `[[<slug>]]` (with optional
 * heading anchor or alias). Mirrors `extractLinksFromMarkdown`'s
 * parser shape — the inbound backfill must agree with the outbound
 * extractor on what counts as a wikilink to `slug`.
 */
function contentReferencesSlug(contentMd: string, slug: string): boolean {
  WIKILINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKILINK_RE.exec(contentMd)) !== null) {
    const inner = m[1]!.trim();
    const [targetPart] = inner.split("|", 1);
    const [targetSlug] = targetPart!.split("#", 1);
    if (targetSlug!.trim() === slug) return true;
  }
  return false;
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

  // Load peers once. The slug→noteId map services BOTH the outbound
  // wikilink resolution AND the inbound-resolution backfill.
  const peers = await repo.listNotesInVault(input.vaultId, { limit: 10_000 });
  const slugToNoteId = new Map<string, number>();
  for (const p of peers) {
    slugToNoteId.set(p.slug, p.id);
  }

  // ---- Outbound wikilink jobs (extraction → resolved targets) ----
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
        sourceNoteId: input.noteId,
        sourceVersionId: input.versionId,
        targetSlug: wl.targetSlug,
        targetNoteId,
      },
    });
    wikilinkJobIds.push(job.jobId);
  }

  // ---- Inbound-resolution backfill (note.created only) ----
  // When a note is FIRST created, peers that previously wrote
  // `[[<slug>]]` against it would have enqueued wikilink.changed
  // events with targetNoteId=null — the sync-worker's
  // wikilink.changed case returns [] for null targets, so those
  // edges never materialized in Neo4j. Now that the target exists,
  // re-enqueue wikilink.changed for each peer that referenced it.
  //
  // Cost: O(N) latest-version fetches per createNote. Acceptable
  // at MVP scale (<1000 notes); a follow-on can replace with a
  // single JOIN on note_versions WHERE content_md ILIKE '%[[slug]]%'.
  //
  // Skipped on note.updated: slug doesn't change on update; peer
  // wikilinks already resolved on the peer's own enqueue pass.
  let inboundBackfilledCount = 0;
  if (input.eventKind === "note.created") {
    for (const peer of peers) {
      if (peer.id === input.noteId) continue;
      const peerVersion = await repo.getLatestNoteVersion(peer.id);
      if (!peerVersion) continue;
      if (!contentReferencesSlug(peerVersion.contentMd, input.slug)) continue;
      await graphRepo.enqueueProjectionJob({
        projectionKey: `vault_wikilink:${peerVersion.id}:${input.slug}`,
        triggerEvent: "wikilink.changed",
        triggerPayload: {
          sourceNoteId: peer.id,
          sourceVersionId: peerVersion.id,
          targetSlug: input.slug,
          targetNoteId: input.noteId,
        },
      });
      inboundBackfilledCount++;
    }
  }

  return {
    noteJobId: noteJob.jobId,
    wikilinkJobIds,
    unresolvedSlugs,
    inboundBackfilledCount,
  };
}
