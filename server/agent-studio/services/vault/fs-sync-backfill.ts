/**
 * Vault FS-sync backfill helper.
 *
 * Track A — A5 follow-up. Bundles the FS-sync export shape that the
 * tRPC layer (`triggerInitialBackfill`) + the post-commit hook layer
 * (A6) both need: rendering a note as the on-disk `.md` blob with the
 * FS-side frontmatter conventions baked in.
 *
 * Sibling module (not under `fs-sync/`) because it depends on BOTH
 * the markdown-import-export profile AND the FS-sync writer. Keeping
 * it out of `fs-sync/` preserves the boundary "fs-sync is pure FS,
 * no contract-shape knowledge."
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

import { renderNoteAsMarkdown } from "./markdown-import-export.js";

export { materializeNotes, resolveNoteFilePath } from "./fs-sync/index.js";

/**
 * FS-sync frontmatter shape — superset of the in-DB frontmatter:
 * always carries title + slug + noteId + version so an external
 * editor can identify the note unambiguously.
 */
export interface RenderForFsSyncInput {
  readonly title: string;
  readonly slug: string;
  readonly contentMd: string;
  readonly frontmatter: Record<string, unknown>;
  readonly version: number;
  readonly noteId?: number;
}

/**
 * Renders a note as the on-disk `.md` blob. Re-uses the existing
 * `renderNoteAsMarkdown` and injects the FS-side stable identifiers
 * (slug, title, version, noteId) into the frontmatter so disk → DB
 * upserts (FS→DB direction) can identify the note unambiguously
 * even if the operator renames the file on disk.
 */
export function renderNoteAsMarkdownForFsSync(
  input: RenderForFsSyncInput,
): string {
  const frontmatter: Record<string, unknown> = {
    ...input.frontmatter,
    title: input.title,
    slug: input.slug,
    version: input.version,
    ...(input.noteId !== undefined ? { noteId: input.noteId } : {}),
  };
  return renderNoteAsMarkdown({
    frontmatter,
    contentMd: input.contentMd,
  });
}
