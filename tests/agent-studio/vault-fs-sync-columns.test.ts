/**
 * Track A — A2 — agent-studio-vault-fs-sync schema migration.
 *
 * Source-scan locks the two columns added to the Drizzle schema:
 *  - ags_vaults.fs_sync_path (text nullable) — per-vault opt-in path
 *  - ags_vault_notes.fs_sync_last_hash (varchar 64 nullable) — cycle
 *    prevention SHA-256 hex (durable across restarts)
 *
 * The ASDB seed reconciler at server/agent-studio/db/seed.ts runs
 * CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS
 * on boot, so no separate migration file is needed — only the
 * Drizzle schema change. This test locks the schema declaration so a
 * future refactor can't silently drop either column.
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("Track A — A2 — vault FS-sync schema columns", () => {
  const schema = resolve(
    __dirname,
    "../../drizzle/tables/agent-studio-vault.ts",
  );

  it("ags_vaults.fs_sync_path declared as nullable text", () => {
    const src = readFileSync(schema, "utf8");
    // Column name + camelCase property name.
    expect(src).toContain('fsSyncPath: text("fs_sync_path")');
    // Must NOT be .notNull() — null means "sync disabled for this vault".
    // The slice below extracts the agsVaults block to avoid matching
    // accidental .notNull() elsewhere in the file.
    const vaultsBlock =
      src.match(/agsVaults\s*=\s*pgTable\([\s\S]*?\(t\)\s*=>/)?.[0] ?? "";
    expect(vaultsBlock).toContain("fs_sync_path");
    expect(
      /fsSyncPath:\s*text\("fs_sync_path"\)\.notNull\(\)/.test(vaultsBlock),
      "fs_sync_path must stay nullable — null = sync disabled",
    ).toBe(false);
  });

  it("ags_vault_notes.fs_sync_last_hash declared as nullable varchar(64)", () => {
    const src = readFileSync(schema, "utf8");
    expect(src).toContain(
      'fsSyncLastHash: varchar("fs_sync_last_hash", { length: 64 })',
    );
    // SHA-256 hex is exactly 64 chars; the length constraint locks the
    // contract so a future refactor can't widen it silently.
    const notesBlock =
      src.match(/agsVaultNotes\s*=\s*pgTable\([\s\S]*?\(t\)\s*=>/)?.[0] ?? "";
    expect(notesBlock).toContain("fs_sync_last_hash");
    expect(notesBlock).toContain("length: 64");
    expect(
      /fsSyncLastHash:[^,\n]*\.notNull\(\)/.test(notesBlock),
      "fs_sync_last_hash must stay nullable — null = never round-tripped through disk yet",
    ).toBe(false);
  });

});
