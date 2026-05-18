/**
 * Vault FS-sync — public-api barrel.
 *
 * Track A — A3. Re-exports the public surface so callers import
 * from one place. Internal helpers stay file-local.
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

export {
  ALLOWED_ROOTS_ENV,
  assertVaultRootIsConfigurable,
  assertPathInsideVaultRoot,
  getAllowedRoots,
  isUnderAllowedRoot,
} from "./path-validator.js";
export {
  MD_EXTENSION,
  parseNotePathFromAbs,
  resolveNoteFilePath,
  vaultLockFilePath,
} from "./path-resolver.js";
export { sha256Hex } from "./content-hash.js";
export {
  isStagingFile,
  TMP_SUFFIX,
  writeMarkdownAtomic,
  type WriteMarkdownOptions,
} from "./writer.js";
export { readMarkdownFile, type ReadMarkdownOptions } from "./reader.js";
export {
  materializeNotes,
  type ReconcilerOptions,
  type ReconcilerWriteSpec,
} from "./reconciler.js";
export {
  FsSyncError,
  type FsSyncBackfillResult,
  type FsSyncReadResult,
  type FsSyncStatus,
  type FsSyncWriteResult,
} from "./types.js";
