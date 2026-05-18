/**
 * Vault FS-sync — content hashing.
 *
 * Track A — A3. SHA-256 hex digest of UTF-8-encoded content.
 *
 * The cycle-prevention guard on both DB→FS and FS→DB paths compares
 * the about-to-be-written hash against `ags_notes.fs_sync_last_hash`
 * (per the ADR). Identical hash → skip — we already produced this
 * content. The hash space is 256 bits so collision probability is
 * astronomically lower than any other failure mode.
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

import { createHash } from "node:crypto";

/**
 * Computes the SHA-256 hex digest of `s` as UTF-8 bytes. Always
 * 64 lowercase hex chars. Matches the `varchar(64)` column width on
 * `ags_notes.fs_sync_last_hash`.
 */
export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
