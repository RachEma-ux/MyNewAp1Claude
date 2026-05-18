/**
 * Vault — Markdown import + export.
 *
 * Phase 15 / Track B B5. The pure parse / render helpers
 * (`parseMarkdownBlob`, `renderNoteAsMarkdown`,
 * `sanitizeFilenameSegment`) live in `shared/vault-markdown-profile.ts`
 * — moved there in B5 so the client-side properties panel can
 * round-trip frontmatter without duplicating the logic. This file
 * keeps the DB-backed `exportNoteAsMarkdown` reader + re-exports the
 * pure helpers so existing server callers see no change.
 *
 * ADR: docs/architecture/agent-studio-markdown-profile.md
 */

import { AsdbVaultRepository } from "./repository-asdb.js";
import type { VaultRepository } from "./repository.js";
import {
  renderNoteAsMarkdown,
  sanitizeFilenameSegment,
} from "../../../../shared/vault-markdown-profile.js";

// Re-export the pure helpers so existing imports keep working.
export {
  parseMarkdownBlob,
  renderNoteAsMarkdown,
  sanitizeFilenameSegment,
  type ParsedMarkdownBlob,
  type RenderNoteInput,
} from "../../../../shared/vault-markdown-profile.js";

export interface ExportNoteAsMarkdownResult {
  readonly noteId: number;
  readonly version: number;
  readonly filename: string;
  readonly markdown: string;
}

export interface ExportNoteAsMarkdownOptions {
  /** Inject a custom vault repo for tests. Defaults to `AsdbVaultRepository`. */
  readonly repository?: VaultRepository;
}

export async function exportNoteAsMarkdown(
  noteId: number,
  options: ExportNoteAsMarkdownOptions = {},
): Promise<ExportNoteAsMarkdownResult | null> {
  const repo = options.repository ?? new AsdbVaultRepository();

  const note = await repo.getNoteById(noteId);
  if (!note) return null;

  const latest = await repo.getLatestNoteVersion(noteId);
  if (!latest) return null;

  const frontmatter: Record<string, unknown> = {
    ...(latest.frontmatter as Record<string, unknown> | null | undefined),
    title: note.title,
    slug: note.slug,
    noteId: note.id,
    version: latest.version,
  };

  const markdown = renderNoteAsMarkdown({
    frontmatter,
    contentMd: latest.contentMd,
  });
  const filename = `${sanitizeFilenameSegment(note.slug)}.md`;

  return {
    noteId: note.id,
    version: latest.version,
    filename,
    markdown,
  };
}
