/**
 * Track A — A9 — Vault FS-sync boundary.
 *
 * Enforces the architectural rule that `fs.write*` / `fs.rename*` /
 * `fs.unlink*` inside the vault service tree are allowed ONLY in
 * the FS-sync sub-module (`fs-sync/` + the two sibling
 * `fs-sync-*.ts` files that straddle the FS ↔ DB boundary).
 *
 * This guard means a future PR can't accidentally re-introduce
 * "let me just write a .md somewhere" that bypasses the writer's
 * cycle-prevention guard, the chokidar-safe atomic-write pattern,
 * or the per-vault path-validator scope.
 *
 * ADR: docs/architecture/agent-studio-vault-fs-sync.md
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { resolve, sep } from "path";

import { describe, expect, it } from "vitest";

const VAULT_DIR = resolve(
  __dirname,
  "../../server/agent-studio/services/vault",
);

/** Subpaths permitted to use fs.write* and friends. */
const FS_WRITE_ALLOWED_PREFIXES = [
  `${VAULT_DIR}${sep}fs-sync${sep}`,
  `${VAULT_DIR}${sep}fs-sync.ts`,
  `${VAULT_DIR}${sep}fs-sync-backfill.ts`,
  `${VAULT_DIR}${sep}fs-sync-integration.ts`,
];

/** Regexes that catch the forbidden FS-write API surface. */
const FORBIDDEN_PATTERNS: Array<{ name: string; rx: RegExp }> = [
  {
    name: "fs.writeFile / promises.writeFile",
    rx: /(?:^|[^.\w])writeFile(?:Sync)?\s*\(/,
  },
  {
    name: "fs.rename / promises.rename",
    rx: /(?:^|[^.\w])rename(?:Sync)?\s*\(/,
  },
  {
    name: "fs.unlink / promises.unlink",
    rx: /(?:^|[^.\w])unlink(?:Sync)?\s*\(/,
  },
  {
    name: "fs.mkdir / promises.mkdir",
    rx: /(?:^|[^.\w])mkdir(?:Sync)?\s*\(/,
  },
];

function* walkTsFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = resolve(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      yield* walkTsFiles(p);
    } else if (
      st.isFile() &&
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.endsWith(".d.ts")
    ) {
      yield p;
    }
  }
}

function isAllowed(filePath: string): boolean {
  return FS_WRITE_ALLOWED_PREFIXES.some((prefix) =>
    filePath.startsWith(prefix),
  );
}

describe("Track A — A9 — vault FS-write boundary", () => {
  it("fs.write* / rename / unlink / mkdir restricted to fs-sync* paths", () => {
    const violations: Array<{
      file: string;
      api: string;
      line: number;
      snippet: string;
    }> = [];

    for (const file of walkTsFiles(VAULT_DIR)) {
      if (isAllowed(file)) continue;
      const src = readFileSync(file, "utf8");
      const lines = src.split(/\r?\n/);
      lines.forEach((line, i) => {
        for (const { name, rx } of FORBIDDEN_PATTERNS) {
          if (rx.test(line)) {
            violations.push({
              file: file.replace(VAULT_DIR + sep, ""),
              api: name,
              line: i + 1,
              snippet: line.trim(),
            });
          }
        }
      });
    }

    if (violations.length > 0) {
      const detail = violations
        .map((v) => `  ${v.file}:${v.line} (${v.api}) → ${v.snippet}`)
        .join("\n");
      throw new Error(
        `FS-write boundary violation — these calls must move into server/agent-studio/services/vault/fs-sync*/ or use the existing writer/reader helpers:\n${detail}`,
      );
    }
    expect(violations).toEqual([]);
  });

  it("the writer + reader + reconciler exist where the boundary expects them", () => {
    // Existence check on the four files the FS-sync sub-module
    // declares as the only legitimate FS-write callers. If a future
    // refactor moves them out of fs-sync/, the allow list above
    // must move with them.
    const expected = [
      `${VAULT_DIR}${sep}fs-sync${sep}writer.ts`,
      `${VAULT_DIR}${sep}fs-sync${sep}reader.ts`,
      `${VAULT_DIR}${sep}fs-sync${sep}reconciler.ts`,
      `${VAULT_DIR}${sep}fs-sync-integration.ts`,
    ];
    for (const f of expected) {
      expect(() => statSync(f), `missing ${f}`).not.toThrow();
    }
  });
});
