/**
 * Vault — wikilink + backlink + embed extraction engine.
 *
 * Phase 5 MVP. Parses CommonMark + the Agent Studio Markdown Profile wikilinks:
 *   [[Note]]
 *   [[Note#Heading]]
 *   [[Note|Alias]]
 *   ![[Note]]           (embed)
 *   ![[image.png]]      (attachment embed)
 *
 * Returns structural data ready for the projection sync layer to write into
 * `ags_vault_wikilinks` / `ags_vault_backlinks` / `ags_vault_embeds`.
 */

export interface ExtractedWikilink {
  readonly targetSlug: string;
  readonly headingAnchor: string | null;
  readonly alias: string | null;
  readonly isEmbed: boolean;
  readonly rawMatch: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface ExtractedAttachmentEmbed {
  readonly filename: string;
  readonly rawMatch: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface LinkExtractionResult {
  readonly wikilinks: ExtractedWikilink[];
  readonly attachmentEmbeds: ExtractedAttachmentEmbed[];
  readonly tagSlugs: string[];
}

const WIKILINK_RE = /(!?)\[\[([^\]\n]+?)\]\]/g;
const TAG_RE = /(?:^|\s)#([A-Za-z][A-Za-z0-9_/-]{0,99})/g;

const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".pdf", ".mp3",
  ".wav", ".m4a", ".mp4", ".mov", ".webm",
]);

function looksLikeAttachment(target: string): boolean {
  const lower = target.toLowerCase();
  for (const ext of IMAGE_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

export function extractLinksFromMarkdown(md: string): LinkExtractionResult {
  const wikilinks: ExtractedWikilink[] = [];
  const attachmentEmbeds: ExtractedAttachmentEmbed[] = [];
  const tagSlugs: string[] = [];

  WIKILINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKILINK_RE.exec(md)) !== null) {
    const isEmbed = m[1] === "!";
    const inner = m[2]!.trim();
    if (isEmbed && looksLikeAttachment(inner)) {
      attachmentEmbeds.push({
        filename: inner,
        rawMatch: m[0]!,
        startOffset: m.index,
        endOffset: m.index + m[0]!.length,
      });
      continue;
    }
    const [targetPart, aliasPart] = inner.split("|", 2);
    const target = targetPart!.trim();
    const [slug, anchor] = target.split("#", 2);
    wikilinks.push({
      targetSlug: slug!.trim(),
      headingAnchor: anchor?.trim() ?? null,
      alias: aliasPart?.trim() ?? null,
      isEmbed,
      rawMatch: m[0]!,
      startOffset: m.index,
      endOffset: m.index + m[0]!.length,
    });
  }

  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(md)) !== null) {
    if (m[1]) tagSlugs.push(m[1]);
  }

  return { wikilinks, attachmentEmbeds, tagSlugs };
}

export interface BacklinkRecord {
  readonly targetSlug: string;
  readonly sourceNoteId: number;
  readonly sourceVersionId: number;
  readonly contextSnippet: string;
}

/**
 * Builds backlink records for projection sync.
 * Pure function — no I/O.
 */
export function buildBacklinkRecords(
  noteId: number,
  versionId: number,
  contentMd: string,
  extracted: LinkExtractionResult,
): BacklinkRecord[] {
  return extracted.wikilinks.map((wl) => ({
    targetSlug: wl.targetSlug,
    sourceNoteId: noteId,
    sourceVersionId: versionId,
    contextSnippet: extractContext(contentMd, wl.startOffset, wl.endOffset),
  }));
}

function extractContext(md: string, start: number, end: number, radius = 80): string {
  const from = Math.max(0, start - radius);
  const to = Math.min(md.length, end + radius);
  return md.slice(from, to).replace(/\s+/g, " ").trim();
}

/**
 * Resolves slugs against a known-note table.
 * Returns the wikilinks split into (resolved → noteId) and (unresolved → broken).
 */
export interface ResolvedLink {
  readonly wikilink: ExtractedWikilink;
  readonly targetNoteId: number;
}

export interface UnresolvedLink {
  readonly wikilink: ExtractedWikilink;
}

export function resolveLinks(
  links: ExtractedWikilink[],
  slugToNoteId: Map<string, number>,
): { resolved: ResolvedLink[]; unresolved: UnresolvedLink[] } {
  const resolved: ResolvedLink[] = [];
  const unresolved: UnresolvedLink[] = [];
  for (const wl of links) {
    const id = slugToNoteId.get(wl.targetSlug);
    if (id != null) resolved.push({ wikilink: wl, targetNoteId: id });
    else unresolved.push({ wikilink: wl });
  }
  return { resolved, unresolved };
}
