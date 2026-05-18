/**
 * Vault FS-sync — reconciler.
 *
 * Track A — A3. Higher-level orchestrator that takes a list of
 * `{absPath, contentMd, lastHash}` triples and writes them all,
 * aggregating per-file outcomes. The initial-backfill flow (A8)
 * uses this to one-shot export every note in a vault when
 * `fs_sync_path` is first set or moved.
 *
 * Pure FS layer — caller is responsible for DB queries (fetching
 * the notes + their latest versions + hashes) and for persisting
 * updated `fs_sync_last_hash` values after the writer returns.
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

import type { FsSyncBackfillResult, FsSyncWriteResult } from "./types.js";
import { writeMarkdownAtomic } from "./writer.js";

export interface ReconcilerWriteSpec {
  readonly absPath: string;
  readonly contentMd: string;
  readonly lastHash: string | null;
}

export interface ReconcilerOptions {
  readonly vaultId: number;
  readonly vaultRoot: string;
  readonly specs: readonly ReconcilerWriteSpec[];
  /**
   * Optional per-note callback fired after each write attempt. The
   * caller uses this to persist the new hash back into
   * `ags_notes.fs_sync_last_hash` for `kind: "written"` outcomes
   * (the writer itself doesn't touch DB).
   */
  readonly onWritten?: (
    spec: ReconcilerWriteSpec,
    result: FsSyncWriteResult,
  ) => void | Promise<void>;
}

/**
 * Writes every spec serially (intentional — concurrent writes
 * inside the same vault root can race on parent-directory mkdir
 * and produce confusing chokidar event storms). Returns an
 * aggregate result.
 */
export async function materializeNotes(
  options: ReconcilerOptions,
): Promise<FsSyncBackfillResult> {
  const { vaultId, vaultRoot, specs, onWritten } = options;
  let written = 0;
  let skippedEcho = 0;
  const errors: FsSyncBackfillResult["errors"] = [];

  for (const spec of specs) {
    const result = await writeMarkdownAtomic({
      vaultRoot,
      absPath: spec.absPath,
      contentMd: spec.contentMd,
      lastHash: spec.lastHash,
    });
    if (onWritten) await onWritten(spec, result);
    switch (result.kind) {
      case "written":
        written++;
        break;
      case "skipped_echo":
        skippedEcho++;
        break;
      case "error":
        errors.push({ absPath: result.absPath, error: result.error });
        break;
      case "skipped_disabled":
        // Backfill is only invoked when sync is enabled — this branch
        // shouldn't fire here; if it ever does, surface as an error
        // so the operator sees something unexpected happened.
        errors.push({
          absPath: spec.absPath,
          error: "unexpected skipped_disabled during backfill",
        });
        break;
    }
  }

  return {
    vaultId,
    notesTotal: specs.length,
    written,
    skippedEcho,
    errors,
  };
}
