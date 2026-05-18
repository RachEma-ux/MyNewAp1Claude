/**
 * Vault FS-sync — shared types.
 *
 * Track A — A3. Pure types; no DB / no FS imports here.
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

/** Outcome of a single DB→FS write. */
export type FsSyncWriteResult =
  | { kind: "written"; absPath: string; hash: string }
  | { kind: "skipped_echo"; absPath: string; hash: string }
  | { kind: "skipped_disabled"; reason: "vault_sync_disabled" }
  | { kind: "error"; absPath: string; error: string };

/** Outcome of a single FS→DB read. */
export type FsSyncReadResult =
  | {
      kind: "parsed";
      absPath: string;
      hash: string;
      contentMd: string;
      frontmatter: Record<string, unknown>;
    }
  | { kind: "skipped_echo"; absPath: string; hash: string }
  | { kind: "error"; absPath: string; error: string };

/** Per-vault FS-sync status surface (returned by getFsSyncStatus tRPC in A5). */
export interface FsSyncStatus {
  readonly vaultId: number;
  readonly enabled: boolean;
  readonly fsSyncPath: string | null;
  readonly lastSyncAt: Date | null;
  readonly notesWritten: number;
  readonly notesPendingBackfill: number;
  readonly lastError: string | null;
}

/** Aggregate result returned by the initial-backfill reconciler. */
export interface FsSyncBackfillResult {
  readonly vaultId: number;
  readonly notesTotal: number;
  readonly written: number;
  readonly skippedEcho: number;
  readonly errors: Array<{ absPath: string; error: string }>;
}

/** Tagged error class for FS-sync failures. */
export class FsSyncError extends Error {
  readonly code:
    | "PATH_OUTSIDE_ALLOWED_ROOTS"
    | "PATH_NOT_ABSOLUTE"
    | "PATH_SYMLINK_REJECTED"
    | "VAULT_NOT_FOUND"
    | "NOTE_NOT_FOUND"
    | "WRITE_FAILED"
    | "READ_FAILED"
    | "PARSE_FAILED"
    | "FEATURE_DISABLED";

  constructor(
    code: FsSyncError["code"],
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "FsSyncError";
    this.code = code;
  }
}
