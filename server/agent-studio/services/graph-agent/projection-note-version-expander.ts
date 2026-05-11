/**
 * Native Graph Workspace — runtime-trace note-version edge expander.
 *
 * Phase 14 §6/§7 infrastructure. Companion to the skill-pack expander
 * (PR #468). For a `runtime_trace` projection intent, emits:
 *
 *   (:NoteVersion {id, noteId})                            ← upsert
 *   (:RuntimeTrace)-[:REFERENCES_NOTE_VERSION]->(:NoteVersion)
 *
 * The edge carries `referenceKind` ("cag_block", "graph_skill", "rac",
 * etc.) so consumers can filter why the note was referenced. Edge id
 * encodes (runtimeRunId, noteVersionId, referenceKind) so the same
 * version referenced for two different reasons in one run produces two
 * distinct edges.
 *
 * Same two-surface pattern as PR #467/#468:
 *   1. `expandRuntimeNoteVersionEdges(runtimeRunId, rows)` — PURE.
 *   2. `loadRuntimeNoteReferencesForRun(runtimeRunId, options)` — ASDB.
 *
 * ADR: docs/architecture/agent-studio-graph-projection-sync.md
 */

import { eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import { agsRuntimeNoteReferences } from "../../../../drizzle/tables/agent-studio-graph-promotion.js";
import type {
  ProjectionWrite,
  ProvenanceFields,
} from "../graph/repository/types.js";

export interface RuntimeNoteReferenceRow {
  readonly noteId: number;
  readonly noteVersionId: number;
  readonly referenceKind: string;
}

function provenance(
  sourceType: string,
  sourceId: string,
): ProvenanceFields {
  return {
    sourceType,
    sourceId,
    lineageStatus: "derived",
    governanceStatus: "active",
  };
}

function runtimeTraceNodeId(runtimeRunId: number): string {
  return `runtime_trace:${runtimeRunId}`;
}

function noteVersionNodeId(noteVersionId: number): string {
  return `note_version:${noteVersionId}`;
}

/**
 * Pure function. Emits one (:NoteVersion) upsert_node per distinct
 * `noteVersionId` and one REFERENCES_NOTE_VERSION upsert_edge per
 * (noteVersionId, referenceKind) pair. The kind suffix on the edge id
 * lets the same note version be referenced multiple times in a run
 * for different reasons without collapsing into one edge.
 */
export function expandRuntimeNoteVersionEdges(
  runtimeRunId: number,
  rows: readonly RuntimeNoteReferenceRow[],
): ProjectionWrite[] {
  const runtimeTraceId = runtimeTraceNodeId(runtimeRunId);
  const writes: ProjectionWrite[] = [];
  const seenVersions = new Set<number>();
  const seenEdges = new Set<string>();

  for (const row of rows) {
    if (!seenVersions.has(row.noteVersionId)) {
      seenVersions.add(row.noteVersionId);
      writes.push({
        kind: "upsert_node",
        node: {
          typeKey: "NoteVersion",
          id: noteVersionNodeId(row.noteVersionId),
          sourceId: String(row.noteVersionId),
          properties: { noteId: row.noteId },
          provenance: provenance(
            "vault_note_version",
            String(row.noteVersionId),
          ),
        },
      });
    }

    const edgeKey = `${row.noteVersionId}:${row.referenceKind}`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);

    writes.push({
      kind: "upsert_edge",
      edge: {
        typeKey: "REFERENCES_NOTE_VERSION",
        id: `references_note_version:${runtimeRunId}:${row.noteVersionId}:${row.referenceKind}`,
        sourceNode: { typeKey: "RuntimeTrace", id: runtimeTraceId },
        targetNode: {
          typeKey: "NoteVersion",
          id: noteVersionNodeId(row.noteVersionId),
        },
        properties: { referenceKind: row.referenceKind },
        provenance: provenance(
          "runtime_note_reference",
          `${runtimeRunId}:${row.noteVersionId}:${row.referenceKind}`,
        ),
      },
    });
  }
  return writes;
}

export interface LoadRuntimeNoteReferencesOptions {
  readonly getDb?: typeof getAsDb;
}

/**
 * Reader companion. Selects note references for a run. Returns []
 * when ASDB is unavailable.
 */
export async function loadRuntimeNoteReferencesForRun(
  runtimeRunId: number,
  options: LoadRuntimeNoteReferencesOptions = {},
): Promise<readonly RuntimeNoteReferenceRow[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      noteId: agsRuntimeNoteReferences.noteId,
      noteVersionId: agsRuntimeNoteReferences.noteVersionId,
      referenceKind: agsRuntimeNoteReferences.referenceKind,
    })
    .from(agsRuntimeNoteReferences)
    .where(eq(agsRuntimeNoteReferences.runtimeRunId, runtimeRunId));

  return rows as readonly RuntimeNoteReferenceRow[];
}
