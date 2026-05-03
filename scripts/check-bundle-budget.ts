/**
 * Bundle budget guardrail — Phase 12 caveat lift.
 *
 * The production-readiness verification report flagged five Vite
 * bundle-size warnings (`WikiArticle`, `emacs-lisp`, `wasm`,
 * `cpp`, `index`) at >600KB each as a Phase 12 caveat. Four of
 * those five are Shiki language grammars — Streamdown bundles
 * Shiki, which ships every supported language as its own chunk.
 * Those chunks are lazy-loaded only when a wiki article actually
 * uses that language, so the size is a property of the grammar,
 * not a hot-path performance issue.
 *
 * What we *do* care about is regressions on the non-language
 * chunks: the main app entry, route capsules, and shared vendor
 * bundles. Those load on first paint or on route navigation.
 *
 * This script runs after `pnpm run build` and:
 *   1. Walks `dist/public/assets/`.
 *   2. Categorizes every JS chunk as either `language` (Shiki
 *      grammar — pattern matched against the curated list of
 *      Shiki language ids) or `application` (everything else).
 *   3. Asserts:
 *        - max application chunk ≤ APP_BUDGET_BYTES
 *        - max language chunk ≤ LANG_BUDGET_BYTES
 *   4. Exits non-zero on violation, with a diff vs budget so the
 *      regression is obvious.
 *
 * Treat this as a budget assertion, not a benchmark. A new
 * vendor that pushes the application bound is a budget review,
 * not a script bug.
 */

import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const ASSETS_DIR = path.resolve(
  process.cwd(),
  "dist",
  "public",
  "assets",
);

// Application chunks: anything we ship as a route, vendor bundle,
// or platform shell. The 653KB index chunk we observed at the
// time of the readiness audit is the realistic upper-bound on a
// healthy main app entry; bumping past 1024KB warrants a budget
// review.
const APP_BUDGET_BYTES = 1024 * 1024;

// Language chunks: Shiki ships per-language grammars as separate
// JS bundles. They run only when a code fence requests that
// language. The largest grammar we observed was emacs-lisp at
// ~780KB; Wolfram and a few others are similar. 1.5MB is a
// generous cap that catches genuinely-broken bundling
// (e.g. accidentally inlining a worker payload) without
// flagging a normal grammar.
const LANG_BUDGET_BYTES = 1.5 * 1024 * 1024;

// Curated list of Shiki bundled language ids — derived from the
// `shiki` package's `bundledLanguages` map. We don't import
// shiki in this script (avoid pulling 1MB of grammars into a
// build-side check); the list is small enough to maintain
// inline. New languages added to Shiki upstream that we don't
// have here will fall into the `application` bucket and trip
// the tighter budget — that's a desirable failure mode (you
// notice and update the list).
const LANGUAGE_IDS = new Set([
  "abap", "actionscript-3", "ada", "angular-html", "angular-ts",
  "apache", "apex", "apl", "applescript", "ara", "asciidoc",
  "asm", "astro", "awk", "ballerina", "bash", "batch", "beancount",
  "berry", "bibtex", "bicep", "blade", "bsl", "c", "cadence",
  "cairo", "clarity", "clojure", "cmake", "cobol", "codeowners",
  "codeql", "coffee", "common-lisp", "coq", "cpp", "crystal",
  "csharp", "css", "csv", "cue", "cypher", "d", "dart", "dax",
  "desktop", "diff", "docker", "dotenv", "dream-maker", "edge",
  "elixir", "elm", "emacs-lisp", "erb", "erlang", "fennel",
  "fish", "fluent", "fortran-fixed-form", "fortran-free-form",
  "fsharp", "gdresource", "gdscript", "gdshader", "genie",
  "gherkin", "git-commit", "git-rebase", "gleam", "glimmer-js",
  "glimmer-ts", "glsl", "gnuplot", "go", "graphql", "groovy",
  "hack", "haml", "handlebars", "haskell", "haxe", "hcl", "hjson",
  "hlsl", "html", "html-derivative", "http", "hxml", "hy",
  "imba", "ini", "java", "javascript", "jinja", "jison", "json",
  "json5", "jsonc", "jsonl", "jsonnet", "jssm", "jsx", "julia",
  "kotlin", "kusto", "latex", "lean", "less", "liquid", "log",
  "logo", "lua", "luau", "make", "markdown", "marko", "matlab",
  "mdc", "mdx", "mermaid", "mipsasm", "mojo", "move", "narrat",
  "nextflow", "nginx", "nim", "nix", "nushell", "objective-c",
  "objective-cpp", "ocaml", "pascal", "perl", "php", "plsql",
  "po", "polar", "postcss", "powerquery", "powershell", "prisma",
  "prolog", "proto", "pug", "puppet", "purescript", "python",
  "qml", "qmldir", "qss", "r", "racket", "raku", "razor", "reg",
  "regexp", "rel", "riscv", "rst", "ruby", "rust", "sas",
  "sass", "scala", "scheme", "scss", "sdbl", "shaderlab",
  "shellscript", "shellsession", "smalltalk", "solidity",
  "soy", "sparql", "splunk", "sql", "ssh-config", "stata",
  "stylus", "svelte", "swift", "system-verilog", "systemd",
  "talonscript", "tasl", "tcl", "templ", "terraform", "tex",
  "toml", "ts-tags", "tsv", "tsx", "turtle", "twig", "typescript",
  "typespec", "typst", "v", "vala", "vb", "verilog", "vhdl",
  "viml", "vue", "vue-html", "vue-vine", "vyper", "wasm",
  "wenyan", "wgsl", "wikitext", "wit", "wolfram", "xml", "xsl",
  "yaml", "zenscript", "zig",
]);

interface ChunkRow {
  name: string;
  bytes: number;
  category: "language" | "application";
}

function classify(name: string): "language" | "application" {
  // Vite emits chunks named "<id>-<hash>.js" where <hash> is an
  // 8-char alphanumeric (rollup `[hash:8]`). The id may itself
  // contain hyphens (`emacs-lisp`, `vue-vine`), so we strip
  // ONLY a trailing `-<8 alnum chars>.js`, not the full
  // `-...js` suffix (greedy strip would chop `emacs-lisp` to
  // `emacs`).
  const stem = name.replace(/-[A-Za-z0-9_-]{8}\.js$/, "");
  return LANGUAGE_IDS.has(stem) ? "language" : "application";
}

function fmt(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function main(): void {
  let entries: string[];
  try {
    entries = readdirSync(ASSETS_DIR);
  } catch {
    console.error(
      `[bundle-budget] ${ASSETS_DIR} does not exist. Run 'pnpm run build' first.`,
    );
    process.exit(2);
  }

  const chunks: ChunkRow[] = [];
  for (const name of entries) {
    if (!name.endsWith(".js")) continue;
    const full = path.join(ASSETS_DIR, name);
    const bytes = statSync(full).size;
    chunks.push({ name, bytes, category: classify(name) });
  }
  if (chunks.length === 0) {
    console.error("[bundle-budget] No JS chunks found in build output.");
    process.exit(2);
  }

  chunks.sort((a, b) => b.bytes - a.bytes);

  const apps = chunks.filter((c) => c.category === "application");
  const langs = chunks.filter((c) => c.category === "language");
  const maxApp = apps[0];
  const maxLang = langs[0];

  console.log("[bundle-budget] Build summary:");
  console.log(`  Total chunks:        ${chunks.length}`);
  console.log(`  Application chunks:  ${apps.length}`);
  console.log(`  Language chunks:     ${langs.length}`);
  console.log("");
  console.log("Top 10 application chunks:");
  for (const c of apps.slice(0, 10)) {
    console.log(`  ${c.name.padEnd(50)} ${fmt(c.bytes)}`);
  }
  console.log("");
  console.log("Top 5 language chunks (lazy-loaded by Shiki):");
  for (const c of langs.slice(0, 5)) {
    console.log(`  ${c.name.padEnd(50)} ${fmt(c.bytes)}`);
  }

  const violations: string[] = [];
  if (maxApp && maxApp.bytes > APP_BUDGET_BYTES) {
    violations.push(
      `application chunk over budget: ${maxApp.name} = ${fmt(maxApp.bytes)} (limit ${fmt(APP_BUDGET_BYTES)})`,
    );
  }
  if (maxLang && maxLang.bytes > LANG_BUDGET_BYTES) {
    violations.push(
      `language chunk over budget: ${maxLang.name} = ${fmt(maxLang.bytes)} (limit ${fmt(LANG_BUDGET_BYTES)})`,
    );
  }

  if (violations.length > 0) {
    console.error("");
    console.error("[bundle-budget] FAIL");
    for (const v of violations) console.error(`  - ${v}`);
    console.error(
      "\nReview docs/deployment/bundle-size-strategy.md before raising budgets.",
    );
    process.exit(1);
  }

  console.log("");
  console.log("[bundle-budget] PASS — every chunk is within budget.");
}

main();
