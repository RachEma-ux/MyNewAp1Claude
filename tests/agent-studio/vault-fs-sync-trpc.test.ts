/**
 * Track A — A5 — Vault FS-sync tRPC procedures.
 *
 * Locks the three procedures (`setFsSyncPath`, `getFsSyncStatus`,
 * `triggerInitialBackfill`) + their input shapes + their wiring into
 * the FS-sync module on the vault router. Behavioral coverage of the
 * actual sync semantics lives in the module unit tests (A3 + A4)
 * and the end-to-end test that A8 will introduce.
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const ROUTER = resolve(
  __dirname,
  "../../server/agent-studio/services/vault/router.ts",
);
const REPO_INTERFACE = resolve(
  __dirname,
  "../../server/agent-studio/services/vault/repository.ts",
);
const REPO_ASDB = resolve(
  __dirname,
  "../../server/agent-studio/services/vault/repository-asdb.ts",
);
const BACKFILL = resolve(
  __dirname,
  "../../server/agent-studio/services/vault/fs-sync-backfill.ts",
);

function read(p: string): string {
  return readFileSync(p, "utf8");
}

describe("A5 — vault FS-sync tRPC procedures", () => {
  const src = read(ROUTER);

  it("declares setFsSyncPath as a mutation with admin-friendly input", () => {
    expect(src).toMatch(/setFsSyncPath:\s*protectedProcedure/);
    // Path can be null (disable sync) or a 1..2048 char string.
    expect(src).toMatch(/path:\s*z\.string\(\)\.min\(1\)\.max\(2048\)\.nullable\(\)/);
    expect(src).toMatch(/vaultId:\s*z\.number\(\)\.int\(\)\.positive\(\)/);
  });

  it("declares getFsSyncStatus as a query", () => {
    expect(src).toMatch(/getFsSyncStatus:\s*protectedProcedure/);
    expect(src).toMatch(/\.query\(/);
  });

  it("declares triggerInitialBackfill as a mutation", () => {
    expect(src).toMatch(/triggerInitialBackfill:\s*protectedProcedure/);
  });

  it("setFsSyncPath validates via assertVaultRootIsConfigurable", () => {
    expect(src).toMatch(/assertVaultRootIsConfigurable/);
    expect(src).toMatch(/FsSyncError/);
    // BAD_REQUEST is the operator-facing surface for path validation
    // failures — the FsSyncError code becomes the human-readable
    // message.
    expect(src).toMatch(/code:\s*["']BAD_REQUEST["']/);
  });

  it("setFsSyncPath wires the WatcherManager lifecycle (getOrStart / stop)", () => {
    expect(src).toMatch(/defaultWatcherManager\.getOrStart/);
    expect(src).toMatch(/defaultWatcherManager\.stop/);
  });

  it("triggerInitialBackfill delegates to runInitialBackfill (post-A8 shape)", () => {
    // A8 collapsed the inline reconciler call into a 3-line
    // delegation to the shared `runInitialBackfill` helper that
    // both the manual-trigger path and the auto-fire on first
    // enable share. Lock the delegation so a future refactor
    // doesn't accidentally re-duplicate the logic.
    expect(src).toMatch(/runInitialBackfill\(repo/);
    expect(src).toMatch(/fs-sync-integration/);
  });
});

describe("A5 — VaultRepository FS-sync surface", () => {
  it("interface declares the 4 FS-sync methods", () => {
    const src = read(REPO_INTERFACE);
    expect(src).toMatch(/getVaultFsSyncPath\(vaultId:\s*number\)/);
    expect(src).toMatch(/setVaultFsSyncPath\(vaultId:\s*number,\s*path:\s*string\s*\|\s*null\)/);
    expect(src).toMatch(/findNoteBySlugInVault\(/);
    expect(src).toMatch(/setNoteFsSyncLastHash\(noteId:\s*number,\s*hash:\s*string\s*\|\s*null\)/);
  });

  it("AsdbVaultRepository implements all 4 FS-sync methods", () => {
    const src = read(REPO_ASDB);
    expect(src).toMatch(/async\s+getVaultFsSyncPath\(/);
    expect(src).toMatch(/async\s+setVaultFsSyncPath\(/);
    expect(src).toMatch(/async\s+findNoteBySlugInVault\(/);
    expect(src).toMatch(/async\s+setNoteFsSyncLastHash\(/);
  });
});

describe("A5 — fs-sync-backfill helper", () => {
  const src = read(BACKFILL);

  it("re-exports materializeNotes + resolveNoteFilePath from the FS-sync module", () => {
    expect(src).toMatch(
      /export\s*\{\s*materializeNotes\s*,\s*resolveNoteFilePath\s*\}/,
    );
  });

  it("renderNoteAsMarkdownForFsSync injects title + slug + version into frontmatter", () => {
    expect(src).toMatch(/title:\s*input\.title/);
    expect(src).toMatch(/slug:\s*input\.slug/);
    expect(src).toMatch(/version:\s*input\.version/);
  });

  it("delegates to existing renderNoteAsMarkdown (no duplicate rendering logic)", () => {
    expect(src).toMatch(/from\s+["']\.\/markdown-import-export\.js["']/);
    expect(src).toMatch(/renderNoteAsMarkdown\(\{/);
  });
});
