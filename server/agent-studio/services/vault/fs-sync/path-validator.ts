/**
 * Vault FS-sync — path validator.
 *
 * Track A — A3. Enforces the security model from the ADR:
 *  - `fs_sync_path` must be absolute.
 *  - `fs_sync_path` must be under one of the operator-configured roots
 *    in `VAULT_FS_SYNC_ALLOWED_ROOTS` (comma-separated absolute paths).
 *  - All paths derived for individual notes are checked to ensure they
 *    don't escape `fs_sync_path` after `realpath` resolution
 *    (symlink-traversal guard).
 *
 * Missing/empty `VAULT_FS_SYNC_ALLOWED_ROOTS` = feature globally
 * disabled.
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

import { realpathSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

import { FsSyncError } from "./types.js";

const ALLOWED_ROOTS_ENV = "VAULT_FS_SYNC_ALLOWED_ROOTS";

/**
 * Returns the parsed list of allowed roots. Empty array means the
 * feature is globally disabled (intentional — operators must opt-in
 * by setting the env variable). Trailing slashes are normalized away;
 * non-absolute entries are dropped (the ADR requires absolute paths).
 */
export function getAllowedRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env[ALLOWED_ROOTS_ENV];
  if (!raw || raw.trim().length === 0) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && isAbsolute(s))
    .map((s) => normalizeRoot(s));
}

/** Strips trailing separators so containment checks are unambiguous. */
function normalizeRoot(p: string): string {
  return p.endsWith(sep) ? p.slice(0, -1) : p;
}

/**
 * Returns true if `candidate` is under any allowed root. Both sides
 * are normalized; comparison uses path-segment containment (no
 * substring trickery).
 */
export function isUnderAllowedRoot(
  candidate: string,
  roots: string[] = getAllowedRoots(),
): boolean {
  if (!isAbsolute(candidate)) return false;
  const normalized = normalizeRoot(resolve(candidate));
  return roots.some(
    (root) => normalized === root || normalized.startsWith(root + sep),
  );
}

/**
 * Asserts `vaultRoot` is configurable as an FS-sync target. Throws
 * `FsSyncError` with the precise reason — used by the admin-gated
 * `setFsSyncPath` tRPC procedure (A5) to surface operator-facing
 * errors.
 */
export function assertVaultRootIsConfigurable(
  vaultRoot: string,
  roots: string[] = getAllowedRoots(),
): void {
  if (roots.length === 0) {
    throw new FsSyncError(
      "FEATURE_DISABLED",
      `${ALLOWED_ROOTS_ENV} is not set — vault FS-sync is globally disabled. Set the env variable to an absolute-path list to enable.`,
    );
  }
  if (!isAbsolute(vaultRoot)) {
    throw new FsSyncError(
      "PATH_NOT_ABSOLUTE",
      `fs_sync_path must be absolute, got: ${vaultRoot}`,
    );
  }
  if (!isUnderAllowedRoot(vaultRoot, roots)) {
    throw new FsSyncError(
      "PATH_OUTSIDE_ALLOWED_ROOTS",
      `fs_sync_path ${vaultRoot} is not under any allowed root: ${roots.join(", ")}`,
    );
  }
}

/**
 * Asserts an individual note's resolved absolute path stays under
 * `vaultRoot`. Uses `realpathSync` to resolve symlinks — if the link
 * target escapes the vault root, this throws. The writer calls this
 * before every disk write.
 */
export function assertPathInsideVaultRoot(
  vaultRoot: string,
  absPath: string,
): void {
  if (!isAbsolute(absPath)) {
    throw new FsSyncError(
      "PATH_NOT_ABSOLUTE",
      `note path must be absolute, got: ${absPath}`,
    );
  }
  let resolved: string;
  try {
    resolved = realpathSync(absPath);
  } catch {
    // realpath fails if the file doesn't exist yet (expected on first
    // write). Fall back to syntactic resolve in that case; the parent
    // directory is checked separately below.
    resolved = resolve(absPath);
  }
  const normalizedVault = normalizeRoot(realpathSyncSafe(vaultRoot));
  const normalizedTarget = normalizeRoot(resolved);
  if (
    normalizedTarget !== normalizedVault &&
    !normalizedTarget.startsWith(normalizedVault + sep)
  ) {
    throw new FsSyncError(
      "PATH_SYMLINK_REJECTED",
      `resolved path ${normalizedTarget} escapes vault root ${normalizedVault}`,
    );
  }
}

/**
 * `realpathSync` may fail if the directory doesn't exist yet — fall
 * back to a syntactic resolve for the parent check. Used only on
 * `vaultRoot` (which always exists if it's been validated as the
 * sync target).
 */
function realpathSyncSafe(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

export { ALLOWED_ROOTS_ENV };
