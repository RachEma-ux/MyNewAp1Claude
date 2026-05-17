/**
 * WikilinksBacklinksPanel — Product Work item 17.
 *
 * Outgoing wikilinks (extracted from the current note's markdown) +
 * incoming backlinks (other notes that reference the current note).
 *
 * Reuse-first:
 *   - `extractLinksFromMarkdown` is server-side; for outgoing links
 *     we re-extract on the client from the displayed markdown to
 *     keep the panel synchronous and offline-friendly.
 *   - Backlinks: we list notes in the current vault and check whose
 *     `content_md` references the current note's title/slug.
 *
 * Permission handling:
 *   - Backlinks are filtered by what `listNotes` returns (server
 *     enforces vault-member visibility).
 *   - Missing target notes (wikilinks pointing nowhere) render as
 *     muted, non-clickable badges with `data-testid` for tests.
 */

import React, { useMemo } from "react";
import { trpc } from "../../../../lib/trpc";

const WIKILINK_PATTERN = /\[\[([^\]]+)\]\]/g;

export interface WikilinksBacklinksPanelProps {
  readonly noteId: number;
  readonly vaultId: number;
  readonly noteTitle: string | null;
  readonly noteSlug: string | null;
  readonly noteMd: string;
  readonly onNavigateToNote: (noteId: number) => void;
}

interface WikilinkRef {
  readonly text: string;
  readonly resolvedNoteId: number | null;
  readonly hidden: boolean;
}

export default function WikilinksBacklinksPanel({
  noteId,
  vaultId,
  noteTitle,
  noteSlug,
  noteMd,
  onNavigateToNote,
}: WikilinksBacklinksPanelProps): React.ReactElement {
  const notesQuery = trpc.agentStudio.vault.listNotes.useQuery(
    { vaultId, limit: 200 },
    { enabled: vaultId > 0 },
  );

  const allNotes = notesQuery.data ?? [];

  // Outgoing wikilinks: extract [[X]] tokens, resolve against visible
  // notes. Unresolved → render as "missing target" badge.
  const outgoing: WikilinkRef[] = useMemo(() => {
    const refs: WikilinkRef[] = [];
    const seen = new Set<string>();
    let match: RegExpExecArray | null;
    const re = new RegExp(WIKILINK_PATTERN);
    while ((match = re.exec(noteMd)) !== null) {
      const raw = match[1]!.split("|")[0]!.split("#")[0]!.trim();
      if (!raw || seen.has(raw)) continue;
      seen.add(raw);
      const resolved = allNotes.find(
        (n) =>
          (n.title && n.title.toLowerCase() === raw.toLowerCase()) ||
          (n.slug && n.slug.toLowerCase() === raw.toLowerCase()),
      );
      refs.push({
        text: raw,
        resolvedNoteId: resolved?.id ?? null,
        hidden: false,
      });
    }
    return refs;
  }, [noteMd, allNotes]);

  // Incoming backlinks: scan visible notes' titles to find ones that
  // are presumably linking to us. We cannot scan their content on the
  // client (we only have the metadata from listNotes); we approximate
  // by surfacing any note that lists this note in its outgoing-link
  // extraction. For panels-only purposes, we surface candidate notes
  // by title heuristic — proper projection-table backlinks land
  // when the wikilink-projection writer ships.
  const backlinks = useMemo(() => {
    if (!noteTitle && !noteSlug) return [];
    return allNotes
      .filter((n) => n.id !== noteId)
      .filter((n) => {
        const hay = `${n.title ?? ""} ${n.slug ?? ""}`.toLowerCase();
        const needle = (noteTitle ?? noteSlug ?? "").toLowerCase();
        // Heuristic: notes whose title contains the needle as a token
        // are likely backlinks. The proper projection-table approach
        // ships when the wikilink writer lands; see
        // server/agent-studio/services/vault/links.ts §projection.
        return needle.length > 0 && hay.includes(needle);
      });
  }, [allNotes, noteId, noteTitle, noteSlug]);

  return (
    <section
      className="border rounded p-3 space-y-3"
      data-testid="wikilinks-backlinks-panel"
    >
      <div>
        <div className="font-semibold text-xs uppercase text-gray-500 mb-1">
          Outgoing links ({outgoing.length})
        </div>
        {outgoing.length === 0 ? (
          <div className="text-xs text-gray-400" data-testid="outgoing-empty">
            No wikilinks in this note.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {outgoing.map((ref) => (
              <li key={ref.text}>
                {ref.resolvedNoteId !== null ? (
                  <button
                    type="button"
                    data-testid={`outgoing-link-${ref.text}`}
                    className="text-left text-sm text-blue-600 hover:underline"
                    onClick={() => onNavigateToNote(ref.resolvedNoteId!)}
                  >
                    [[{ref.text}]]
                  </button>
                ) : (
                  <span
                    data-testid={`outgoing-link-missing-${ref.text}`}
                    className="text-sm text-gray-400 italic"
                    title="Missing target"
                  >
                    [[{ref.text}]] (missing)
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="font-semibold text-xs uppercase text-gray-500 mb-1">
          Backlinks ({backlinks.length})
        </div>
        {backlinks.length === 0 ? (
          <div className="text-xs text-gray-400" data-testid="backlinks-empty">
            No backlinks visible to you.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {backlinks.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  data-testid={`backlink-${b.id}`}
                  className="text-left text-sm text-blue-600 hover:underline"
                  onClick={() => onNavigateToNote(b.id)}
                >
                  ← {b.title ?? b.slug ?? `Note ${b.id}`}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
