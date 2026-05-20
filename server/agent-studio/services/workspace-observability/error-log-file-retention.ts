/**
 * Universal error event log file — retention sweep.
 *
 * Sister of the DB-row retention sweeps (#622 runtime-runs, #626
 * tool-call-traces, #630 mcp-transitions, #634 catalog-sync-log,
 * #639 rac-runtime-traces, #645 cag-pack-events, etc). Those each
 * prune a DB table; this one prunes the file-system sibling that
 * the universal error event log feature (#1673) ships into
 * `logs/error-events-YYYY-MM-DD.jsonl`.
 *
 * Strategy: list files in the configured log dir whose basename
 * matches `error-events-YYYY-MM-DD.jsonl`. Parse the date from the
 * basename (NOT mtime — mtime advances on every append, so an
 * old log day's file might still be active if a backfill replayed
 * into it). Delete files whose embedded date is strictly older
 * than the configured retention boundary.
 *
 * Fail-soft contract: scanning errors, parse errors, and unlink
 * errors are caught individually and reported in the result's
 * `errors` array. The sweep never throws; a partial sweep is
 * preferable to an aborted sweep that leaves the operator without
 * forensic coverage.
 */

import {
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "fs";
import { join, resolve } from "path";

const LOG_DIR_ENV = "AGS_ERROR_LOG_DIR";
const DEFAULT_LOG_DIR = "logs";

const LOG_FILE_REGEX = /^error-events-(\d{4})-(\d{2})-(\d{2})\.jsonl$/;

export interface PruneOldErrorLogFilesInput {
  /** Files whose embedded UTC date is strictly before this boundary are deleted. */
  readonly olderThan: Date;
  /** Optional explicit dir override (test seam). Defaults to env / cwd `logs/`. */
  readonly logDir?: string;
}

export interface PruneOldErrorLogFilesResult {
  /** Number of files actually unlinked. */
  readonly deletedCount: number;
  /** Total bytes freed. Sum of stat.size at deletion time. */
  readonly bytesFreed: number;
  /** File names that were skipped because they didn't match the daily-rotated pattern. */
  readonly skippedCount: number;
  /** Per-file unlink failures (path + reason). Sweep continues on each. */
  readonly errors: ReadonlyArray<{ path: string; reason: string }>;
  /** Scanned dir (resolved). */
  readonly scannedDir: string;
}

function resolveLogDir(override?: string): string {
  if (override !== undefined) return resolve(override);
  const fromEnv = process.env[LOG_DIR_ENV];
  return fromEnv && fromEnv.length > 0
    ? resolve(fromEnv)
    : resolve(process.cwd(), DEFAULT_LOG_DIR);
}

function parseEmbeddedDate(basename: string): Date | null {
  const m = LOG_FILE_REGEX.exec(basename);
  if (!m) return null;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  // Construct as UTC midnight to match the writer (which uses UTC date).
  const d = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0, 0));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Prune log files older than `input.olderThan`. Never throws.
 */
export function pruneOldErrorLogFiles(
  input: PruneOldErrorLogFilesInput,
): PruneOldErrorLogFilesResult {
  const scannedDir = resolveLogDir(input.logDir);
  const empty: PruneOldErrorLogFilesResult = {
    deletedCount: 0,
    bytesFreed: 0,
    skippedCount: 0,
    errors: [],
    scannedDir,
  };

  if (!existsSync(scannedDir)) return empty;

  let entries: string[];
  try {
    entries = readdirSync(scannedDir);
  } catch (e) {
    return {
      ...empty,
      errors: [
        {
          path: scannedDir,
          reason: `readdir failed: ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
    };
  }

  let deletedCount = 0;
  let bytesFreed = 0;
  let skippedCount = 0;
  const errors: Array<{ path: string; reason: string }> = [];

  for (const name of entries) {
    const embeddedDate = parseEmbeddedDate(name);
    if (embeddedDate === null) {
      skippedCount++;
      continue;
    }
    if (embeddedDate.getTime() >= input.olderThan.getTime()) {
      // File is within retention — keep.
      continue;
    }
    const full = join(scannedDir, name);
    let size = 0;
    try {
      size = statSync(full).size;
    } catch {
      // stat failure isn't fatal — still try unlink.
    }
    try {
      unlinkSync(full);
      deletedCount++;
      bytesFreed += size;
    } catch (e) {
      errors.push({
        path: full,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    deletedCount,
    bytesFreed,
    skippedCount,
    errors,
    scannedDir,
  };
}
