/**
 * Vault FS-sync — path resolver.
 *
 * Track A — A3. Given a vault root + folder hierarchy + note slug,
 * produce the absolute disk path. Inverse direction: given an
 * absolute path under a vault root, produce the folder-segments +
 * slug pair that addresses the corresponding note row.
 *
 * Filename sanitization reuses the existing `sanitizeFilenameSegment`
 * from `markdown-import-export.ts` — single source of truth for the
 * disk-naming policy. Folder segments use the same sanitizer so
 * disk path == DB folder hierarchy modulo sanitization.
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

import { join, relative, sep } from "node:path";

import { sanitizeFilenameSegment } from "../markdown-import-export.js";

const MD_EXTENSION = ".md";

/**
 * Resolves the absolute on-disk path for a note.
 *
 * @param vaultRoot Absolute path to the vault's sync directory.
 * @param folderSegments Folder hierarchy from root → leaf (each
 *   segment is the folder name; empty array = root folder).
 * @param noteSlug The note's slug (URL-safe per the existing
 *   schema CHECK constraint).
 */
export function resolveNoteFilePath(
  vaultRoot: string,
  folderSegments: readonly string[],
  noteSlug: string,
): string {
  const safeFolders = folderSegments.map(sanitizeFilenameSegment);
  const safeFilename = `${sanitizeFilenameSegment(noteSlug)}${MD_EXTENSION}`;
  return join(vaultRoot, ...safeFolders, safeFilename);
}

/**
 * Inverse: given an absolute path under `vaultRoot`, produce the
 * folder segments + slug. Returns null if the file isn't a `.md`
 * directly under the root, or if its relative path escapes the root.
 */
export function parseNotePathFromAbs(
  vaultRoot: string,
  absPath: string,
): { folderSegments: string[]; slug: string } | null {
  const rel = relative(vaultRoot, absPath);
  if (rel.startsWith("..") || rel.startsWith(sep)) return null;
  if (!rel.endsWith(MD_EXTENSION)) return null;
  const withoutExt = rel.slice(0, -MD_EXTENSION.length);
  const parts = withoutExt.split(sep).filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  const slug = parts.pop()!;
  return { folderSegments: parts, slug };
}

/**
 * Absolute path to the per-vault advisory lock file. Only one server
 * process should run a watcher per vault at a time; the watcher
 * module (A4) writes its PID here and checks for an existing
 * conflicting holder before subscribing.
 */
export function vaultLockFilePath(vaultRoot: string): string {
  return join(vaultRoot, ".fs-sync.lock");
}

export { MD_EXTENSION };
