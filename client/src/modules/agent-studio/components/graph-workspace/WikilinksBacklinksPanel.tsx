/**
 * WikilinksBacklinksPanel — Product Work item 17.
 *
 * Outgoing wikilinks (from `[[Other]]` in this note's contentMd) +
 * incoming backlinks (other notes that link TO this note).
 *
 * DB-backed since #1486 + #1487: both axes query the persisted
 * `ags_vault_wikilinks` table via tRPC. Replaces the prior
 * client-side all-vault markdown scan (which shipped up to 200
 * notes of markdown to the browser + re-parsed locally).
 *
 * Notes pre-existing the link-persistence ship (#1482) have no rows
 * in the table; the admin `vault.backfillLinks` mutation (#1487)
 * populates them. The empty-state copy hints at the backfill when
 * neither axis returns results — a soft cue rather than a hard
 * dependency.
 *
 * Permission handling: server-side procedures (`listBacklinks` /
 * `listOutgoingWikilinks`) enforce vault-member visibility; the
 * panel renders whatever shape they return.
 */

import React from "react";
import { trpc } from "../../../../lib/trpc";

export interface WikilinksBacklinksPanelProps {
  readonly noteId: number;
  readonly vaultId: number;
  readonly noteTitle: string | null;
  readonly noteSlug: string | null;
  readonly noteMd: string;
  readonly onNavigateToNote: (noteId: number) => void;
}

export default function WikilinksBacklinksPanel({
  noteId,
  onNavigateToNote,
}: WikilinksBacklinksPanelProps): React.ReactElement {
  const outgoingQuery = trpc.agentStudio.vault.listOutgoingWikilinks.useQuery(
    { noteId },
    { enabled: noteId > 0 },
  );
  const backlinksQuery = trpc.agentStudio.vault.listBacklinks.useQuery(
    { noteId },
    { enabled: noteId > 0 },
  );

  const outgoing = outgoingQuery.data ?? [];
  const backlinks = backlinksQuery.data ?? [];

  return (
    <section
      className="border rounded p-3 space-y-3"
      data-testid="wikilinks-backlinks-panel"
    >
      <div>
        <div className="font-semibold text-xs uppercase text-gray-500 mb-1">
          Outgoing links ({outgoing.length})
        </div>
        {outgoingQuery.isLoading ? (
          <div className="text-xs text-gray-400">Loading…</div>
        ) : outgoing.length === 0 ? (
          <div className="text-xs text-gray-400" data-testid="outgoing-empty">
            No wikilinks in this note.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {outgoing.map((ref) => {
              const label = ref.alias ?? ref.targetTitle ?? ref.targetSlug;
              const anchor = ref.headingAnchor
                ? `#${ref.headingAnchor}`
                : "";
              return (
                <li key={`${ref.targetSlug}:${ref.headingAnchor ?? ""}:${ref.alias ?? ""}`}>
                  {ref.targetNoteId !== null ? (
                    <button
                      type="button"
                      data-testid={`outgoing-link-${ref.targetSlug}`}
                      className="text-left text-sm text-blue-600 hover:underline"
                      onClick={() => onNavigateToNote(ref.targetNoteId!)}
                    >
                      [[{label}{anchor}]]
                    </button>
                  ) : (
                    <span
                      data-testid={`outgoing-link-missing-${ref.targetSlug}`}
                      className="text-sm text-gray-400 italic"
                      title="Missing target"
                    >
                      [[{ref.targetSlug}]] (missing)
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <div className="font-semibold text-xs uppercase text-gray-500 mb-1">
          Backlinks ({backlinks.length})
        </div>
        {backlinksQuery.isLoading ? (
          <div className="text-xs text-gray-400">Loading…</div>
        ) : backlinks.length === 0 ? (
          <div className="text-xs text-gray-400" data-testid="backlinks-empty">
            No backlinks.{" "}
            <span className="text-gray-400 text-[10px]">
              (Notes created before link persistence shipped need a one-time admin backfill.)
            </span>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {backlinks.map((b) => (
              <li key={b.sourceNoteId}>
                <button
                  type="button"
                  data-testid={`backlink-${b.sourceNoteId}`}
                  className="text-left text-sm text-blue-600 hover:underline"
                  onClick={() => onNavigateToNote(b.sourceNoteId)}
                >
                  ← {b.sourceTitle || b.sourceSlug}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
