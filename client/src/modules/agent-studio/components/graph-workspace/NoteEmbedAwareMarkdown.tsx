/**
 * NoteEmbedAwareMarkdown — Track B — B6.
 *
 * Renders a Markdown blob with `![[slug]]` embeds expanded inline.
 * Splits the source at every `![[slug]]` token; each non-embed
 * segment falls through to the existing AppStreamdown renderer; each
 * embed segment is replaced by a NoteEmbed component that fetches
 * the target via `vault.getNote` and recursively renders its
 * contentMd through this same component.
 *
 * Recursion depth is bounded at MAX_EMBED_DEPTH (default 3) to
 * prevent operator-introduced cycles from locking the renderer up.
 *
 * Embed token shape:
 *   ![[note-slug]]               — embed by slug
 *   ![[note-slug|Alias]]         — alias rendered as the link text
 *                                  (NOT yet substituted into the
 *                                  embedded note body; the embed
 *                                  itself takes precedence)
 *   ![[file.png]]                — left as-is for the existing
 *                                  attachment-embed flow (those are
 *                                  rendered by AppStreamdown's image
 *                                  pipeline; we skip them here).
 *
 * Authority: ~/.claude/projects/-root/memory/project_obsidian_vault_authority.md
 */

import React from "react";

import { AppStreamdown } from "../../../../components/markdown/AppStreamdown";
import { trpc } from "../../../../lib/trpc";

const MAX_EMBED_DEPTH = 3;

// `![[slug-or-file]]` or `![[slug|alias]]`. Image-extension targets
// (.png/.jpg/etc) are filtered out below — they're rendered by the
// existing AppStreamdown image flow, not by this embed mechanism.
const EMBED_RE = /!\[\[([^\]\n|]+?)(?:\|([^\]\n]+))?\]\]/g;

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".pdf",
  ".mp3",
  ".wav",
  ".m4a",
  ".mp4",
  ".mov",
  ".webm",
]);

function looksLikeAttachment(target: string): boolean {
  const lower = target.toLowerCase();
  for (const ext of IMAGE_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

interface Segment {
  readonly kind: "text" | "embed";
  readonly text: string;
  /** For embed segments — the resolved target slug (lowercased). */
  readonly slug?: string;
  /** Optional alias from `![[slug|alias]]`. */
  readonly alias?: string;
}

/**
 * Splits the source into alternating text + embed segments. Pure
 * function — easy to unit-test.
 */
export function splitEmbedSegments(source: string): readonly Segment[] {
  const out: Segment[] = [];
  EMBED_RE.lastIndex = 0;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EMBED_RE.exec(source)) !== null) {
    const target = (m[1] ?? "").trim();
    // Attachment-shaped embeds fall through as plain text — the
    // existing AppStreamdown image pipeline handles them.
    if (looksLikeAttachment(target)) continue;
    const before = source.slice(lastIndex, m.index);
    if (before.length > 0) {
      out.push({ kind: "text", text: before });
    }
    out.push({
      kind: "embed",
      text: m[0] ?? "",
      slug: target,
      alias: m[2]?.trim(),
    });
    lastIndex = m.index + (m[0]?.length ?? 0);
  }
  if (lastIndex < source.length) {
    out.push({ kind: "text", text: source.slice(lastIndex) });
  }
  if (out.length === 0) {
    out.push({ kind: "text", text: source });
  }
  return out;
}

export interface NoteEmbedAwareMarkdownProps {
  readonly source: string;
  /** Internal — recursion depth guard. Operators don't pass this. */
  readonly _depth?: number;
}

export default function NoteEmbedAwareMarkdown({
  source,
  _depth = 0,
}: NoteEmbedAwareMarkdownProps): React.ReactElement {
  const segments = splitEmbedSegments(source);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          return <AppStreamdown key={i}>{seg.text}</AppStreamdown>;
        }
        return (
          <NoteEmbed
            key={i}
            slug={seg.slug ?? ""}
            alias={seg.alias}
            depth={_depth + 1}
          />
        );
      })}
    </>
  );
}

interface NoteEmbedProps {
  readonly slug: string;
  readonly alias?: string;
  readonly depth: number;
}

function NoteEmbed({ slug, alias, depth }: NoteEmbedProps): React.ReactElement {
  if (depth > MAX_EMBED_DEPTH) {
    return (
      <aside
        className="border-l-4 border-amber-300 bg-amber-50 px-3 py-2 my-2 text-xs"
        data-testid="note-embed-depth-capped"
        data-slug={slug}
      >
        Embed depth limit reached ({MAX_EMBED_DEPTH}); not expanding{" "}
        <code>{slug}</code>.
      </aside>
    );
  }
  // Resolve the slug to a noteId via listMyVaults + listNotes. For
  // MVP this PR resolves against listNotes for the FIRST vault the
  // user has access to. A follow-on slice (after the operator-supplied
  // vault context is plumbed through Workspace state) can scope the
  // lookup to the current vault.
  const myVaultsQuery = trpc.agentStudio.vault.listMyVaults.useQuery(
    undefined as never,
  );
  const firstVaultId =
    myVaultsQuery.data && myVaultsQuery.data.length > 0
      ? (myVaultsQuery.data[0] as { id: number }).id
      : 0;
  const notesQuery = trpc.agentStudio.vault.listNotes.useQuery(
    { vaultId: firstVaultId, limit: 200 },
    { enabled: firstVaultId > 0 },
  );
  const match =
    notesQuery.data?.find(
      (n) => (n as { slug?: string }).slug === slug,
    ) ?? null;
  const matchedNoteId = (match as { id?: number } | null)?.id ?? null;
  const noteQuery = trpc.agentStudio.vault.getNote.useQuery(
    { noteId: matchedNoteId ?? 0 },
    { enabled: matchedNoteId !== null },
  );

  if (myVaultsQuery.isLoading || notesQuery.isLoading) {
    return (
      <aside
        className="border-l-4 border-gray-300 bg-gray-50 px-3 py-2 my-2 text-xs"
        data-testid="note-embed-loading"
        data-slug={slug}
      >
        Loading <code>{alias ?? slug}</code>…
      </aside>
    );
  }

  if (!match) {
    return (
      <aside
        className="border-l-4 border-red-300 bg-red-50 px-3 py-2 my-2 text-xs"
        data-testid="note-embed-not-found"
        data-slug={slug}
      >
        Embed target not found: <code>{slug}</code>
      </aside>
    );
  }

  if (noteQuery.isLoading) {
    return (
      <aside
        className="border-l-4 border-gray-300 bg-gray-50 px-3 py-2 my-2 text-xs"
        data-testid="note-embed-loading"
        data-slug={slug}
      >
        Loading <code>{alias ?? slug}</code>…
      </aside>
    );
  }

  const embeddedMd = noteQuery.data?.latestVersion?.contentMd ?? "";
  const embeddedTitle =
    (noteQuery.data?.note as { title?: string } | undefined)?.title ?? slug;

  return (
    <aside
      className="border-l-4 border-blue-300 bg-blue-50/40 pl-3 pr-2 py-2 my-2"
      data-testid="note-embed-rendered"
      data-slug={slug}
      data-depth={depth}
    >
      <div className="text-xs font-medium text-blue-800 mb-1">
        {alias ?? embeddedTitle}
      </div>
      <NoteEmbedAwareMarkdown source={embeddedMd} _depth={depth} />
    </aside>
  );
}

export { MAX_EMBED_DEPTH };
