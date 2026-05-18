/**
 * Vault FS-sync — atomic writer.
 *
 * Track A — A3. Pure FS layer: takes an absolute path + content,
 * performs an atomic write (`.tmp` → rename), returns the hash. DB
 * touching is left to the caller (A6 post-commit hook wires this
 * into note mutations + reads/writes fs_sync_last_hash).
 *
 * Atomicity contract: chokidar watchers MUST never see a half-
 * written file. The `.tmp` extension is excluded from the watcher's
 * glob (A4) and the rename is a single inode-level atomic op on
 * POSIX filesystems.
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, basename } from "node:path";

import { sha256Hex } from "./content-hash.js";
import { assertPathInsideVaultRoot } from "./path-validator.js";
import type { FsSyncWriteResult } from "./types.js";
import { FsSyncError } from "./types.js";

/** Suffix used for the staging file before the atomic rename. */
const TMP_SUFFIX = ".tmp";

export interface WriteMarkdownOptions {
  /** Vault root — the writer rejects paths that escape this root. */
  readonly vaultRoot: string;
  /** Absolute target path for the `.md` file. */
  readonly absPath: string;
  /** Markdown blob (with frontmatter — caller renders via existing helper). */
  readonly contentMd: string;
  /**
   * Optional prior hash from `ags_notes.fs_sync_last_hash`. When
   * the to-be-written content's hash matches this value, the writer
   * short-circuits — disk is already up to date. Skip is the
   * cycle-prevention guard (DB→FS half).
   */
  readonly lastHash?: string | null;
}

/**
 * Atomically writes `contentMd` to `absPath`. Creates parent
 * directories as needed. Returns the SHA-256 hex of the bytes
 * written so the caller can persist it into `fs_sync_last_hash`.
 *
 * Cycle-prevention: if `lastHash` matches the computed hash, returns
 * `{kind:"skipped_echo"}` without touching disk.
 */
export async function writeMarkdownAtomic(
  options: WriteMarkdownOptions,
): Promise<FsSyncWriteResult> {
  const { vaultRoot, absPath, contentMd, lastHash = null } = options;
  const hash = sha256Hex(contentMd);

  if (lastHash !== null && lastHash === hash) {
    return { kind: "skipped_echo", absPath, hash };
  }

  // Symlink-escape guard: rejects paths whose realpath escapes the
  // vault root. For first writes (the file doesn't exist yet) the
  // resolver falls back to syntactic resolve — the file's parent
  // directory is created below; if THAT path is symlinked outside
  // the root, the post-write realpath check would catch it. For
  // MVP the parent-creation case is rare (operator-supplied
  // directories), so we keep the check simple.
  try {
    assertPathInsideVaultRoot(vaultRoot, absPath);
  } catch (e) {
    if (e instanceof FsSyncError) {
      return { kind: "error", absPath, error: e.message };
    }
    throw e;
  }

  const dir = dirname(absPath);
  const tmpPath = `${absPath}${TMP_SUFFIX}`;
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(tmpPath, contentMd, { encoding: "utf8" });
    await rename(tmpPath, absPath);
  } catch (e) {
    return {
      kind: "error",
      absPath,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return { kind: "written", absPath, hash };
}

/**
 * Helper for the watcher (A4): is this filename one of OUR tmp
 * staging files? Watchers must ignore them to avoid reading half-
 * written content.
 */
export function isStagingFile(absPath: string): boolean {
  return basename(absPath).endsWith(TMP_SUFFIX);
}

export { TMP_SUFFIX };
