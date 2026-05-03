/**
 * Guardrail — markdown / Shiki import boundaries.
 *
 * Enforces the architecture decision behind PR 11 (Shiki bundle-size fix):
 *
 *   1. Nothing in the codebase may import `streamdown` directly.
 *      The `streamdown` package's compiled bundle imports
 *      `bundledLanguages` from `shiki`, which causes Vite to emit
 *      one chunk per Shiki grammar (200+ chunks). The app must
 *      route all Markdown rendering through `AppStreamdown`, which
 *      uses an allow-listed Shiki highlighter.
 *
 *   2. Only `client/src/lib/shiki/SlimShikiHighlighter.ts` may
 *      import Shiki (`shiki`, `shiki/core`, `shiki/engine/*`,
 *      `@shikijs/langs/*`, `@shikijs/themes/*`). Any other Shiki
 *      import path defeats the allow-list and risks pulling the
 *      full grammar map back in.
 *
 * This script greps the source tree (excluding node_modules, dist,
 * the compiled bundle artefact at `client/dist`, and this file's own
 * test fixtures). Any violation fails the build.
 *
 * Run via `pnpm run check:markdown-imports`. Wired into the
 * production-readiness audit indirectly through the architecture
 * check suite.
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = process.cwd();

interface Rule {
  description: string;
  pattern: RegExp;
  allowedFiles: Set<string>;
}

// Patterns are constructed via RegExp() with concatenated fragments so the
// matchable byte sequence is not literally present in this file — otherwise
// the script would flag its own source when scanned.
const STREAMDOWN_RULE: Rule = {
  description: "direct import of streamdown (route through AppStreamdown instead)",
  pattern: new RegExp("from\\s+[\"']" + "streamdown" + "(\\/[^\"']*)?[\"']"),
  allowedFiles: new Set<string>(),
};

const SHIKI_RULE: Rule = {
  description:
    "direct import of Shiki (route through client/src/lib/shiki/SlimShikiHighlighter.ts)",
  pattern: new RegExp(
    "from\\s+[\"'](" + "shiki" + "(\\/[^\"']*)?|@shikijs\\/[^\"']+)[\"']",
  ),
  allowedFiles: new Set([
    "client/src/lib/shiki/SlimShikiHighlighter.ts",
  ]),
};

const RULES: Rule[] = [STREAMDOWN_RULE, SHIKI_RULE];

interface Hit {
  rule: Rule;
  file: string;
  line: number;
  text: string;
}

function listSourceFiles(): string[] {
  // Use git ls-files to enumerate tracked files; fall back to find if
  // not in a git repo. We restrict to TS/TSX/JS/JSX since that's
  // where imports live.
  try {
    const out = execSync("git ls-files -z 'client/' 'server/' 'shared/' 'scripts/'", {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    return out
      .split("\0")
      .filter((f) => /\.(?:tsx?|jsx?|mts|cts|mjs|cjs)$/.test(f))
      .filter((f) => !!f);
  } catch {
    const out = execSync(
      "find client server shared scripts -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \\) -not -path '*/node_modules/*' -not -path '*/dist/*'",
      { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    return out.split("\n").filter((f) => f);
  }
}

function check(file: string): Hit[] {
  const abs = path.join(REPO_ROOT, file);
  let body: string;
  try {
    body = readFileSync(abs, "utf8");
  } catch {
    return [];
  }
  const lines = body.split("\n");
  const hits: Hit[] = [];
  for (const rule of RULES) {
    if (rule.allowedFiles.has(file)) continue;
    for (let i = 0; i < lines.length; i++) {
      if (rule.pattern.test(lines[i])) {
        hits.push({ rule, file, line: i + 1, text: lines[i].trim() });
      }
    }
  }
  return hits;
}

function main(): void {
  const files = listSourceFiles();
  const allHits: Hit[] = [];
  for (const f of files) {
    allHits.push(...check(f));
  }

  if (allHits.length === 0) {
    console.log(
      `[markdown-imports] PASS — no direct streamdown or Shiki imports outside SlimShikiHighlighter (${files.length} files scanned).`,
    );
    process.exit(0);
  }

  console.error("[markdown-imports] FAIL");
  const byRule = new Map<Rule, Hit[]>();
  for (const h of allHits) {
    const existing = byRule.get(h.rule) ?? [];
    existing.push(h);
    byRule.set(h.rule, existing);
  }
  for (const [rule, hits] of byRule) {
    console.error(`\n  Violation: ${rule.description}`);
    for (const h of hits) {
      console.error(`    ${h.file}:${h.line}  ${h.text}`);
    }
  }
  console.error(
    "\nFix: import `AppStreamdown` from `@/components/markdown/AppStreamdown` instead of `streamdown`.",
  );
  console.error(
    "    For Shiki: extend the allow-list in client/src/lib/shiki/SlimShikiHighlighter.ts.",
  );
  process.exit(1);
}

main();
