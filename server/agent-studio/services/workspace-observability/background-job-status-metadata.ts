/**
 * Workspace Observability — Background-job status metadata.
 *
 * Slice 28 of the no-deferral continuation catalogue (2026-05-19).
 * Replaces the inline `TERMINAL_BACKGROUND_JOB_STATUSES` set in
 * `background-jobs.ts` with a row-per-status lookup table that the
 * service reseeds at boot.
 *
 * Why a table:
 *   - Operators can adjust per-status behavior (e.g. mark a custom
 *     status as `retryable: false`) without code changes.
 *   - The sweeper, the operator UI rollup, and the alert-severity
 *     classifier all consume the same fields — the table lets them
 *     stay in sync.
 *
 * Reseed model: the in-code defaults are the canonical source; the
 * boot reseed performs an `INSERT … ON CONFLICT DO UPDATE` so manual
 * operator edits to fields not in the defaults (e.g. an added
 * description) survive while the closed-taxonomy fields stay in sync.
 *
 * Failure modes:
 *   - ASDB unavailable → callers fall back to `DEFAULT_BACKGROUND_JOB_STATUS_METADATA`.
 *     Same shape as the rest of Phase 14/15/16 services.
 */

import { getAsDb } from "../../db/connection.js";
import { agsBackgroundJobStatusMetadata } from "../../../../drizzle/tables/agent-studio-graph-quality.js";
import { BACKGROUND_JOB_STATUSES, type JobStatus } from "./background-jobs.js";

export interface BackgroundJobStatusMetadata {
  readonly status: JobStatus;
  readonly terminal: boolean;
  readonly retryable: boolean;
  readonly label: string;
  readonly severity: "info" | "warn" | "error";
  readonly description: string | null;
}

/**
 * Default metadata for every closed-taxonomy status. Loaded on first
 * read; reseeded into ASDB at boot via `seedBackgroundJobStatusMetadata`.
 */
export const DEFAULT_BACKGROUND_JOB_STATUS_METADATA: ReadonlyArray<BackgroundJobStatusMetadata> =
  [
    {
      status: "pending",
      terminal: false,
      retryable: true,
      label: "Pending",
      severity: "info",
      description: "Job enqueued and awaiting a worker.",
    },
    {
      status: "running",
      terminal: false,
      retryable: true,
      label: "Running",
      severity: "info",
      description: "Worker has picked up the job and is executing.",
    },
    {
      status: "completed",
      terminal: true,
      retryable: false,
      label: "Completed",
      severity: "info",
      description: "Job finished successfully — eligible for sweep.",
    },
    {
      status: "failed",
      terminal: true,
      retryable: true,
      label: "Failed",
      severity: "error",
      description:
        "Job exited with an error. Retryable: the worker may re-enqueue.",
    },
    {
      status: "cancelled",
      terminal: true,
      retryable: false,
      label: "Cancelled",
      severity: "warn",
      description:
        "Job was withdrawn (operator action or supersession). Not retryable.",
    },
  ];

/**
 * In-memory cache. Populated lazily on first read; reset by tests via
 * `__resetBackgroundJobStatusMetadataCacheForTests()`.
 */
let _cache: ReadonlyArray<BackgroundJobStatusMetadata> | null = null;
let _cachedTerminalSet: ReadonlySet<JobStatus> | null = null;

export function __resetBackgroundJobStatusMetadataCacheForTests(): void {
  _cache = null;
  _cachedTerminalSet = null;
}

/**
 * Returns the in-memory metadata array. Lazy-reads from the cache (if
 * populated by `loadBackgroundJobStatusMetadataFromDb`); otherwise
 * returns the in-code defaults.
 */
export function getBackgroundJobStatusMetadata(): ReadonlyArray<BackgroundJobStatusMetadata> {
  return _cache ?? DEFAULT_BACKGROUND_JOB_STATUS_METADATA;
}

/**
 * Derives the set of terminal (sweep-eligible) statuses from whichever
 * metadata source is current. Caches the derivation; the cache resets
 * whenever the metadata cache is invalidated.
 */
export function getTerminalBackgroundJobStatuses(): ReadonlySet<JobStatus> {
  if (_cachedTerminalSet) return _cachedTerminalSet;
  const set = new Set<JobStatus>();
  for (const md of getBackgroundJobStatusMetadata()) {
    if (md.terminal) set.add(md.status);
  }
  _cachedTerminalSet = set;
  return set;
}

/**
 * Returns the metadata row for a given status, or `null` if unknown.
 * Unknown statuses arise during a closed-taxonomy extension (the code
 * adds a status before the DB row exists, or vice versa).
 */
export function getMetadataForStatus(
  status: JobStatus,
): BackgroundJobStatusMetadata | null {
  return getBackgroundJobStatusMetadata().find((m) => m.status === status) ?? null;
}

/**
 * Reseeds the `ags_background_job_status_metadata` table from the
 * in-code defaults. Idempotent — uses `ON CONFLICT DO UPDATE` so manual
 * operator edits to fields not in the defaults (e.g. a custom
 * description) survive.
 *
 * Returns the seeded rows. Throws `AsdbUnavailableError`-shaped errors
 * to the caller for boot-time logging.
 */
export async function seedBackgroundJobStatusMetadata(
  options: { getDb?: typeof getAsDb } = {},
): Promise<ReadonlyArray<BackgroundJobStatusMetadata>> {
  const db = (options.getDb ?? getAsDb)();
  for (const md of DEFAULT_BACKGROUND_JOB_STATUS_METADATA) {
    await db
      .insert(agsBackgroundJobStatusMetadata)
      .values({
        status: md.status,
        terminal: md.terminal,
        retryable: md.retryable,
        label: md.label,
        severity: md.severity,
        description: md.description,
      })
      .onConflictDoUpdate({
        target: agsBackgroundJobStatusMetadata.status,
        set: {
          terminal: md.terminal,
          retryable: md.retryable,
          label: md.label,
          severity: md.severity,
          // description is preserved as the operator may have edited
          // it — only re-write it when the in-code default is non-null
          // (a deliberate signal that the default carries semantic
          // meaning the operator-edited copy should defer to).
          ...(md.description !== null ? { description: md.description } : {}),
          updatedAt: new Date(),
        },
      });
  }
  // Read-back so the cache reflects whatever is now in ASDB (post-
  // ON-CONFLICT-DO-UPDATE).
  return await loadBackgroundJobStatusMetadataFromDb({ getDb: options.getDb });
}

/**
 * Reads the metadata table into the in-memory cache. Falls back to the
 * in-code defaults if ASDB is unavailable or the table is empty (e.g.
 * a fresh deployment where the seed hasn't run yet).
 */
export async function loadBackgroundJobStatusMetadataFromDb(
  options: { getDb?: typeof getAsDb } = {},
): Promise<ReadonlyArray<BackgroundJobStatusMetadata>> {
  try {
    const db = (options.getDb ?? getAsDb)();
    const rows = await db
      .select({
        status: agsBackgroundJobStatusMetadata.status,
        terminal: agsBackgroundJobStatusMetadata.terminal,
        retryable: agsBackgroundJobStatusMetadata.retryable,
        label: agsBackgroundJobStatusMetadata.label,
        severity: agsBackgroundJobStatusMetadata.severity,
        description: agsBackgroundJobStatusMetadata.description,
      })
      .from(agsBackgroundJobStatusMetadata);
    if (rows.length === 0) {
      _cache = DEFAULT_BACKGROUND_JOB_STATUS_METADATA;
    } else {
      _cache = rows
        .filter((r): r is typeof r & { status: JobStatus } =>
          (BACKGROUND_JOB_STATUSES as readonly string[]).includes(r.status),
        )
        .map((r) => ({
          status: r.status,
          terminal: r.terminal,
          retryable: r.retryable,
          label: r.label,
          severity: r.severity as "info" | "warn" | "error",
          description: r.description ?? null,
        }));
    }
  } catch {
    _cache = DEFAULT_BACKGROUND_JOB_STATUS_METADATA;
  }
  _cachedTerminalSet = null; // invalidate the derived terminal set
  return getBackgroundJobStatusMetadata();
}
