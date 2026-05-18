/**
 * Vault FS-sync — reader.
 *
 * Track A — A3. Pure FS layer: reads a `.md` file, parses via the
 * existing `parseMarkdownBlob` helper, returns the contentMd +
 * frontmatter + hash. DB persistence is left to the caller (A4
 * watcher + A6 hooks decide whether to upsert as a new note version
 * or short-circuit on echo).
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

import { readFile } from "node:fs/promises";

import { parseMarkdownBlob } from "../markdown-import-export.js";
import { sha256Hex } from "./content-hash.js";
import { assertPathInsideVaultRoot } from "./path-validator.js";
import type { FsSyncReadResult } from "./types.js";
import { FsSyncError } from "./types.js";

export interface ReadMarkdownOptions {
  readonly vaultRoot: string;
  readonly absPath: string;
  /**
   * Optional prior hash from `ags_notes.fs_sync_last_hash` (looked
   * up by the caller via vault + slug match). When the on-disk
   * content's hash matches, the reader returns `skipped_echo` —
   * cycle-prevention guard (FS→DB half).
   */
  readonly lastHash?: string | null;
}

/**
 * Reads `absPath`, computes its hash, and parses the markdown blob
 * (separating frontmatter from contentMd via the markdown-profile
 * contract). Returns a tagged result so the caller can branch on
 * echo / parse error / OK.
 */
export async function readMarkdownFile(
  options: ReadMarkdownOptions,
): Promise<FsSyncReadResult> {
  const { vaultRoot, absPath, lastHash = null } = options;

  try {
    assertPathInsideVaultRoot(vaultRoot, absPath);
  } catch (e) {
    if (e instanceof FsSyncError) {
      return { kind: "error", absPath, error: e.message };
    }
    throw e;
  }

  let raw: string;
  try {
    raw = await readFile(absPath, { encoding: "utf8" });
  } catch (e) {
    return {
      kind: "error",
      absPath,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const hash = sha256Hex(raw);
  if (lastHash !== null && lastHash === hash) {
    return { kind: "skipped_echo", absPath, hash };
  }

  try {
    const parsed = parseMarkdownBlob(raw);
    return {
      kind: "parsed",
      absPath,
      hash,
      contentMd: parsed.contentMd,
      frontmatter: parsed.frontmatter,
    };
  } catch (e) {
    return {
      kind: "error",
      absPath,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
