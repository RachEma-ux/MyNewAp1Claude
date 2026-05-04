#!/usr/bin/env tsx
/**
 * check:provider-credential-resolver-boundary
 *
 * Plan v3 Phase 3 — enforces Decision D2 (DECISION_RECORD.md):
 *
 *   The internal credential resolver
 *   (`server/provider-connections/internal/credential-resolver.ts`)
 *   may be imported ONLY by `server/openrouter/model-access/**`.
 *
 * Forbidden importers:
 *   - server/agent-studio/**
 *   - server/ai-types/**
 *   - server/automation/**
 *   - any frontend file (client/**)
 *   - any other server module not listed in ALLOWED_IMPORTER_PREFIXES
 *
 * The resolver is the only place outside `server/secrets/` where a
 * decrypted provider credential exists. Restricting its caller surface
 * keeps the secret-reach blast radius small and auditable.
 *
 * If a future module needs server-side credential resolution, add it
 * to ALLOWED_IMPORTER_PREFIXES with a documented reason in the
 * `LEGACY_EXCEPTION_REGISTER.md`.
 */

import { join, relative, sep } from "path";
import {
  REPO_ROOT,
  listSourceFiles,
  readFile,
  type Violation,
} from "./lib/module-graph";

const RESOLVER_REL_PATH =
  "server/provider-connections/internal/credential-resolver";

const RESOLVER_DIR_REL_PATH =
  "server/provider-connections/internal/";

/**
 * Files allowed to import the credential resolver. Stored as path
 * prefixes relative to REPO_ROOT, normalized with `/` separators.
 */
const ALLOWED_IMPORTER_PREFIXES = [
  // Plan v3 Decision D4: OpenRouter hosts Model Access.
  "server/openrouter/model-access/",
  // The resolver file itself (and any sibling helper inside the
  // internal subtree) may import each other.
  "server/provider-connections/internal/",
] as const;

/**
 * Match any import specifier (relative or alias) that resolves to the
 * resolver module. Catches:
 *   - `from "../provider-connections/internal/credential-resolver"`
 *   - `from "../../provider-connections/internal/credential-resolver"`
 *   - `from "@/provider-connections/internal/credential-resolver"`
 *   - bare `internal/credential-resolver` reaching across folders
 */
function importerSpecifierTargetsResolver(spec: string): boolean {
  // Strip any trailing .ts/.js extension to make the match uniform.
  const stripped = spec.replace(/\.(ts|tsx|js|mjs|cjs)$/, "");
  if (
    stripped.endsWith("provider-connections/internal/credential-resolver") ||
    stripped.endsWith("/internal/credential-resolver")
  ) {
    // The second alternative is broader — confirm the substring also
    // contains "provider-connections" or is unambiguously this module.
    if (
      stripped.includes("provider-connections/internal/credential-resolver")
    ) {
      return true;
    }
    // Otherwise fall through — a different module's "internal" subtree
    // is its own concern.
    return false;
  }
  // Wildcard re-export of the entire internal directory is also
  // forbidden from outside the allowed importers.
  if (stripped.endsWith("provider-connections/internal")) return true;
  return false;
}

function isAllowedImporter(fileRel: string): boolean {
  return ALLOWED_IMPORTER_PREFIXES.some((prefix) =>
    fileRel.startsWith(prefix),
  );
}

function isInsideRepoServerOrClient(fileRel: string): boolean {
  return fileRel.startsWith("server/") || fileRel.startsWith("client/");
}

const importRegex =
  /(?:^|\n)\s*(?:import\s[^"';]+from\s*|import\s*|export\s[^"';]*from\s*)["']([^"']+)["']/g;

function computeLine(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx; i++) if (src[i] === "\n") line++;
  return line;
}

function main(): void {
  const violations: Violation[] = [];
  const serverFiles = listSourceFiles(join(REPO_ROOT, "server"));
  const clientFiles = listSourceFiles(join(REPO_ROOT, "client"));
  const allFiles = [...serverFiles, ...clientFiles];

  for (const file of allFiles) {
    const fileRel = relative(REPO_ROOT, file).split(sep).join("/");

    // The resolver itself is allowed to be self-referential.
    if (fileRel === `${RESOLVER_REL_PATH}.ts`) continue;
    // Files inside the internal subtree are allowed to import siblings.
    if (fileRel.startsWith(RESOLVER_DIR_REL_PATH)) continue;
    // Files inside the allowed importer set are allowed.
    if (isAllowedImporter(fileRel)) continue;
    // Files outside server/ and client/ aren't checked.
    if (!isInsideRepoServerOrClient(fileRel)) continue;

    const src = readFile(file);
    importRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(src)) !== null) {
      const spec = match[1];
      if (!importerSpecifierTargetsResolver(spec)) continue;
      const line = computeLine(src, match.index);
      violations.push({
        rule: "provider-credential-resolver-boundary",
        file: fileRel,
        line,
        severity: "error",
        message: `Imports the internal credential resolver ("${spec}"). Per Plan v3 Decision D2, only files under server/openrouter/model-access/** may import the resolver. Use the public API surface (server/provider-connections/public-api) for reference data instead.`,
      });
    }
  }

  for (const v of violations) {
    console.error(`[ERROR] ${v.rule} :: ${v.file}:${v.line}\n        ${v.message}`);
  }

  if (violations.length > 0) {
    console.error(
      `\n${violations.length} provider-credential-resolver boundary violation(s).`,
    );
    process.exit(1);
  }

  console.log(
    "OK — provider-credential-resolver boundary check passed (D2).",
  );
  process.exit(0);
}

main();
