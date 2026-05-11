/**
 * Graph Agent Lite — CAG source-note references reader.
 *
 * Phase 14 §8. Reads which CAG block source notes a runtime trace
 * touched (via `ags_runtime_note_references` rows with
 * `reference_kind = "cag_block"`) and joins back to the source note
 * row so the trace-export Markdown can surface "this run pulled
 * context from CAG blocks sourced from vault note Z."
 *
 * Closes the Phase 14 "Trace includes CAG source note references"
 * acceptance criterion. The reader is the read-side of the chain;
 * writers (the CAG runtime that records `reference_kind = "cag_block"`
 * rows when a CAG block fires) land in a follow-on phase when the
 * CAG runtime is wired to record its usage. For now the table is
 * dormant in production traces — the reader returns `[]` and the
 * trace-export render omits the section. The plumbing is in place
 * for the writer to drop in additively.
 *
 * Same shape + fail-soft contract as the §6 graph-skill reader:
 *   - ASDB unavailable → returns `[]` (no throw)
 *   - Empty result → returns `[]` (caller renders nothing)
 *   - Multiple rows for the same noteVersionId → deduped on
 *     noteVersionId so the rendered list shows each source-note
 *     version once, regardless of how many CAG blocks read from it
 *
 * ADR: docs/architecture/agent-studio-graph-agent-runtime.md §1.5
 */

import { and, eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import { agsRuntimeNoteReferences } from "../../../../drizzle/tables/agent-studio-graph-promotion.js";
import {
  agsVaultNotes,
  agsVaultNoteVersions,
} from "../../../../drizzle/tables/agent-studio-vault.js";

export interface CagSourceNoteRef {
  readonly noteId: number;
  readonly noteVersionId: number;
  readonly noteVersion: number | null;
  readonly noteSlug: string | null;
  readonly noteTitle: string | null;
  readonly referenceKind: string;
}

export interface GetCagSourceNoteRefsOptions {
  readonly getDb?: typeof getAsDb;
  /**
   * Override which `reference_kind` values the reader picks up.
   * Defaults to the canonical "cag_block" kind. Test paths can use
   * this to validate the filter without seeding "cag_block" rows.
   */
  readonly referenceKinds?: readonly string[];
}

export async function getCagSourceNoteRefsForRun(
  runtimeRunId: number,
  options: GetCagSourceNoteRefsOptions = {},
): Promise<CagSourceNoteRef[]> {
  const getDb = options.getDb ?? getAsDb;
  const kinds = options.referenceKinds ?? ["cag_block"];

  const db = getDb();
  if (!db) return [];

  const refs: CagSourceNoteRef[] = [];
  const seen = new Set<number>();

  // The dormant `ags_runtime_note_references` table doesn't carry an
  // FK constraint on `reference_kind`, so we read it explicitly. Loop
  // over the requested kinds so a future caller can split the read
  // (e.g., "cag_block" only vs "cag_block" + "tool_result") without
  // changing the query builder.
  for (const kind of kinds) {
    const rows = await db
      .select({
        noteId: agsRuntimeNoteReferences.noteId,
        noteVersionId: agsRuntimeNoteReferences.noteVersionId,
        referenceKind: agsRuntimeNoteReferences.referenceKind,
        noteVersion: agsVaultNoteVersions.version,
        noteSlug: agsVaultNotes.slug,
        noteTitle: agsVaultNotes.title,
      })
      .from(agsRuntimeNoteReferences)
      .leftJoin(
        agsVaultNoteVersions,
        eq(
          agsRuntimeNoteReferences.noteVersionId,
          agsVaultNoteVersions.id,
        ),
      )
      .leftJoin(
        agsVaultNotes,
        eq(agsRuntimeNoteReferences.noteId, agsVaultNotes.id),
      )
      .where(
        and(
          eq(agsRuntimeNoteReferences.runtimeRunId, runtimeRunId),
          eq(agsRuntimeNoteReferences.referenceKind, kind),
        ),
      );

    for (const r of rows) {
      const noteVersionId = Number(r.noteVersionId);
      if (seen.has(noteVersionId)) continue;
      seen.add(noteVersionId);
      refs.push({
        noteId: Number(r.noteId),
        noteVersionId,
        noteVersion: r.noteVersion == null ? null : Number(r.noteVersion),
        noteSlug: r.noteSlug == null ? null : String(r.noteSlug),
        noteTitle: r.noteTitle == null ? null : String(r.noteTitle),
        referenceKind: String(r.referenceKind),
      });
    }
  }

  return refs;
}
