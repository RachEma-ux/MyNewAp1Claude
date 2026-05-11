/**
 * Graph Agent Lite — Graph Skill source-note references reader.
 *
 * Phase 14 §6. Reads which Graph Skill Pack versions a runtime trace
 * touched (via the §4/§5 `ags_graph_skill_runtime_usages` rows) and
 * joins back to the Phase 12.5 §14 `sourceNoteVersionId` FK so the
 * trace-export Markdown can surface "this run used pack X version Y,
 * sourced from vault note Z".
 *
 * Closes the Phase 14 "Trace includes Graph Skill source note
 * references" acceptance criterion.
 *
 * The reader is read-only, takes a `getDb` injection point so unit
 * tests can pass a fake drizzle-shaped DB without standing up ASDB.
 * When ASDB is unavailable it returns `[]` rather than throwing —
 * a missing source-note section in the export is a strictly less
 * useful trace, but not a failure case for the export itself.
 *
 * Dedup: a single trace can touch multiple `ags_graph_skill_runtime_usages`
 * rows for the same `pack_version_id` (one per template fire). The
 * reader collapses to one ref per pack version so the rendered list
 * is "which skill packs did this trace use," not "which template
 * fires happened."
 *
 * ADR: docs/architecture/agent-studio-graph-agent-runtime.md §1.5
 */

import { eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphSkillPacks,
  agsGraphSkillPackVersions,
  agsGraphSkillRuntimeUsages,
} from "../../../../drizzle/tables/agent-studio-graph-skill.js";
import {
  agsVaultNotes,
  agsVaultNoteVersions,
} from "../../../../drizzle/tables/agent-studio-vault.js";

export interface GraphSkillSourceNoteRef {
  readonly packKey: string;
  readonly packName: string;
  readonly packVersionId: number;
  readonly packVersion: string;
  /** FK into `ags_vault_note_versions`; null when the pack version was not published from a vault note. */
  readonly sourceNoteVersionId: number | null;
  readonly sourceNoteId: number | null;
  readonly sourceNoteVersion: number | null;
  readonly sourceNoteSlug: string | null;
  readonly sourceNoteTitle: string | null;
}

export interface GetGraphSkillSourceNoteRefsOptions {
  readonly getDb?: typeof getAsDb;
}

export async function getGraphSkillSourceNoteRefsForRun(
  runtimeRunId: number,
  options: GetGraphSkillSourceNoteRefsOptions = {},
): Promise<GraphSkillSourceNoteRef[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      packKey: agsGraphSkillPacks.skillKey,
      packName: agsGraphSkillPacks.name,
      packVersionId: agsGraphSkillPackVersions.id,
      packVersion: agsGraphSkillPackVersions.version,
      sourceNoteVersionId: agsGraphSkillPackVersions.sourceNoteVersionId,
      sourceNoteId: agsVaultNoteVersions.noteId,
      sourceNoteVersion: agsVaultNoteVersions.version,
      sourceNoteSlug: agsVaultNotes.slug,
      sourceNoteTitle: agsVaultNotes.title,
    })
    .from(agsGraphSkillRuntimeUsages)
    .innerJoin(
      agsGraphSkillPackVersions,
      eq(
        agsGraphSkillRuntimeUsages.packVersionId,
        agsGraphSkillPackVersions.id,
      ),
    )
    .innerJoin(
      agsGraphSkillPacks,
      eq(agsGraphSkillPackVersions.packId, agsGraphSkillPacks.id),
    )
    .leftJoin(
      agsVaultNoteVersions,
      eq(
        agsGraphSkillPackVersions.sourceNoteVersionId,
        agsVaultNoteVersions.id,
      ),
    )
    .leftJoin(
      agsVaultNotes,
      eq(agsVaultNoteVersions.noteId, agsVaultNotes.id),
    )
    .where(eq(agsGraphSkillRuntimeUsages.runtimeRunId, runtimeRunId));

  const seen = new Set<number>();
  const refs: GraphSkillSourceNoteRef[] = [];
  for (const r of rows) {
    const pvId = Number(r.packVersionId);
    if (seen.has(pvId)) continue;
    seen.add(pvId);
    refs.push({
      packKey: String(r.packKey),
      packName: String(r.packName),
      packVersionId: pvId,
      packVersion: String(r.packVersion),
      sourceNoteVersionId:
        r.sourceNoteVersionId == null ? null : Number(r.sourceNoteVersionId),
      sourceNoteId: r.sourceNoteId == null ? null : Number(r.sourceNoteId),
      sourceNoteVersion:
        r.sourceNoteVersion == null ? null : Number(r.sourceNoteVersion),
      sourceNoteSlug: r.sourceNoteSlug == null ? null : String(r.sourceNoteSlug),
      sourceNoteTitle:
        r.sourceNoteTitle == null ? null : String(r.sourceNoteTitle),
    });
  }
  return refs;
}
