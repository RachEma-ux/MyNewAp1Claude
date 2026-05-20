/**
 * Universal error event log file appender.
 *
 * Mirrors every captured error event (server-thrown, client-reported,
 * unhandled JS error, network failure, etc.) into a daily-rotated
 * JSONL file at `logs/error-events-YYYY-MM-DD.jsonl` alongside the
 * existing `ags_workspace_error_events` DB row.
 *
 * Why both: the DB table powers the operator dashboard
 * (`workspaceObservability.*`), but is gated by ASDB availability and
 * 30-day retention. The log file is the always-on, forensic-friendly
 * audit trail — append-only, survives ASDB outages, retainable by
 * operators on their own cadence (rotate / archive / ship to
 * external SIEM).
 *
 * Fail-soft by design: any write error is logged to stderr but never
 * thrown. Observability that breaks the operational path is worse
 * than no observability.
 */

import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";

const LOG_DIR_ENV = "AGS_ERROR_LOG_DIR";
const DEFAULT_LOG_DIR = "logs";

export interface ErrorLogEntry {
  /** ISO timestamp the log appender stamped on the event. */
  readonly loggedAt: string;
  /** Origin of the error: server | client | unhandled_rejection | window_onerror | etc. */
  readonly sourceKind: string;
  /** Optional caller-supplied source id (procedure path, query key, etc.). */
  readonly sourceId?: string | null;
  /** Optional originating user id if known. */
  readonly userId?: number | null;
  /** Error class (e.g. "TRPCError", "TypeError", "NetworkError"). */
  readonly errorClass: string;
  /** Error message (trimmed to a safe length by the appender). */
  readonly errorMessage: string;
  /** Free-form metadata (procedure input shape, stack trace, etc.). */
  readonly metadata?: Record<string, unknown> | null;
  /** Optional DB row id when the event was also persisted to ASDB. */
  readonly errorEventRowId?: number | null;
}

const MAX_MESSAGE_BYTES = 8_192;
const MAX_METADATA_BYTES = 16_384;

function truncate(s: string, maxBytes: number): string {
  if (s.length <= maxBytes) return s;
  return `${s.slice(0, maxBytes)}…[truncated:${s.length - maxBytes}]`;
}

function logDir(): string {
  const fromEnv = process.env[LOG_DIR_ENV];
  return fromEnv && fromEnv.length > 0
    ? resolve(fromEnv)
    : resolve(process.cwd(), DEFAULT_LOG_DIR);
}

function todayFile(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return join(logDir(), `error-events-${yyyy}-${mm}-${dd}.jsonl`);
}

let ensuredDir = false;
function ensureLogDir(): void {
  if (ensuredDir) return;
  const dir = logDir();
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch (e) {
      console.error(
        "[error-log-file] failed to create log dir",
        dir,
        e instanceof Error ? e.message : e,
      );
      return;
    }
  }
  ensuredDir = true;
}

/**
 * Append a single error event to today's log file. Never throws.
 */
export function appendErrorLog(entry: Omit<ErrorLogEntry, "loggedAt">): void {
  ensureLogDir();
  const safe: ErrorLogEntry = {
    loggedAt: new Date().toISOString(),
    sourceKind: String(entry.sourceKind),
    sourceId: entry.sourceId ?? null,
    userId: entry.userId ?? null,
    errorClass: String(entry.errorClass),
    errorMessage: truncate(String(entry.errorMessage), MAX_MESSAGE_BYTES),
    metadata: entry.metadata
      ? safeMetadata(entry.metadata)
      : null,
    errorEventRowId: entry.errorEventRowId ?? null,
  };
  try {
    const line = `${JSON.stringify(safe)}\n`;
    appendFileSync(todayFile(), line, { encoding: "utf8" });
  } catch (e) {
    // Fail-soft. Never let log-write failure propagate.
    console.error(
      "[error-log-file] append failed",
      e instanceof Error ? e.message : e,
    );
  }
}

function safeMetadata(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  try {
    const json = JSON.stringify(raw);
    if (json.length <= MAX_METADATA_BYTES) return raw;
    return {
      _truncated: true,
      _originalBytes: json.length,
      preview: json.slice(0, MAX_METADATA_BYTES),
    };
  } catch {
    return { _serializationFailed: true };
  }
}

/**
 * Test helper — returns the path the appender would write to right now.
 * Exposed so tests can assert file location without re-implementing
 * the date math.
 */
export function _testLogPathForToday(): string {
  return todayFile();
}
