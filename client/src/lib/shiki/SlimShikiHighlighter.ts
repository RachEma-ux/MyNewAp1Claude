/**
 * Allow-listed Shiki highlighter — caps the bundled language set.
 *
 * Why this exists:
 * Streamdown's compiled bundle does
 *   `import { bundledLanguages, createHighlighter } from "shiki"`
 * at the top level. Shiki's `bundledLanguages` is a record whose values
 * are `() => import("@shikijs/langs/<name>")` factories. Vite walks
 * those static `import()` call sites at build time and emits one chunk
 * per language — even though the runtime never invokes most of them —
 * because `import()` always defines a chunk boundary. The result was
 * 220+ language chunks, including `emacs-lisp` (≈780 KB), `cpp`
 * (≈626 KB), `wasm` (≈622 KB), `wolfram`, etc.
 *
 * This module is the SOLE owner of all Shiki imports in the app. Each
 * supported language has its own explicit, literal `import()` call,
 * pinned to `@shikijs/langs/<name>`. Vite emits chunks for ONLY those
 * literals. Languages not in the allow-list fall back to plain text.
 *
 * Adding a language: add an entry to `LANG_LOADERS`. Do not introduce
 * any other Shiki import path elsewhere in the codebase — the
 * `scripts/check-markdown-imports.ts` guardrail enforces that.
 */

import type { HighlighterCore } from "@shikijs/types";

type LangModule = { default: unknown };
type ThemeModule = { default: unknown };

// Curated allow-list. The labels here are the canonical Shiki language
// ids; aliases (e.g. `js`, `ts`, `py`, `sh`) are normalized via ALIASES.
const LANG_LOADERS: Record<string, () => Promise<LangModule>> = {
  bash: () => import("@shikijs/langs/bash"),
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  css: () => import("@shikijs/langs/css"),
  diff: () => import("@shikijs/langs/diff"),
  dockerfile: () => import("@shikijs/langs/docker"),
  go: () => import("@shikijs/langs/go"),
  graphql: () => import("@shikijs/langs/graphql"),
  html: () => import("@shikijs/langs/html"),
  ini: () => import("@shikijs/langs/ini"),
  java: () => import("@shikijs/langs/java"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  jsx: () => import("@shikijs/langs/jsx"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  markdown: () => import("@shikijs/langs/markdown"),
  php: () => import("@shikijs/langs/php"),
  python: () => import("@shikijs/langs/python"),
  ruby: () => import("@shikijs/langs/ruby"),
  rust: () => import("@shikijs/langs/rust"),
  scss: () => import("@shikijs/langs/scss"),
  shellscript: () => import("@shikijs/langs/shellscript"),
  sql: () => import("@shikijs/langs/sql"),
  swift: () => import("@shikijs/langs/swift"),
  toml: () => import("@shikijs/langs/toml"),
  tsx: () => import("@shikijs/langs/tsx"),
  typescript: () => import("@shikijs/langs/typescript"),
  xml: () => import("@shikijs/langs/xml"),
  yaml: () => import("@shikijs/langs/yaml"),
};

const ALIASES: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  zsh: "bash",
  shell: "shellscript",
  yml: "yaml",
  md: "markdown",
  docker: "dockerfile",
  "c++": "cpp",
  "c#": "csharp",
  cs: "csharp",
  kt: "kotlin",
  htm: "html",
};

const THEME_LOADERS: Record<string, () => Promise<ThemeModule>> = {
  "github-light": () => import("@shikijs/themes/github-light"),
  "github-dark": () => import("@shikijs/themes/github-dark"),
};

export type SupportedTheme = keyof typeof THEME_LOADERS;

export function normalizeLanguage(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  const aliased = ALIASES[lower] ?? lower;
  return aliased in LANG_LOADERS ? aliased : null;
}

let highlighterPromise: Promise<HighlighterCore> | null = null;
const loadedLangs = new Set<string>();
const loadedThemes = new Set<string>();

async function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] =
        await Promise.all([
          import("shiki/core"),
          import("shiki/engine/javascript"),
        ]);
      return createHighlighterCore({
        themes: [],
        langs: [],
        engine: createJavaScriptRegexEngine({ forgiving: true }),
      });
    })();
  }
  return highlighterPromise;
}

async function ensureLanguageLoaded(
  h: HighlighterCore,
  lang: string,
): Promise<void> {
  if (loadedLangs.has(lang)) return;
  const loader = LANG_LOADERS[lang];
  if (!loader) return;
  const mod = await loader();
  await h.loadLanguage(mod.default as never);
  loadedLangs.add(lang);
}

async function ensureThemeLoaded(
  h: HighlighterCore,
  theme: string,
): Promise<void> {
  if (loadedThemes.has(theme)) return;
  const loader = THEME_LOADERS[theme as SupportedTheme];
  if (!loader) return;
  const mod = await loader();
  await h.loadTheme(mod.default as never);
  loadedThemes.add(theme);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function plainTextFallback(code: string): string {
  return `<pre class="shiki shiki-fallback"><code>${escapeHtml(code)}</code></pre>`;
}

export interface HighlightedCode {
  light: string;
  dark: string;
  /** True when the language wasn't in the allow-list and we fell back to plain text. */
  fallback: boolean;
}

export async function highlightCode(args: {
  code: string;
  language: string | undefined | null;
  themes: { light: SupportedTheme; dark: SupportedTheme };
}): Promise<HighlightedCode> {
  const lang = normalizeLanguage(args.language);
  if (!lang) {
    const fb = plainTextFallback(args.code);
    return { light: fb, dark: fb, fallback: true };
  }
  const h = await getHighlighter();
  await Promise.all([
    ensureLanguageLoaded(h, lang),
    ensureThemeLoaded(h, args.themes.light),
    ensureThemeLoaded(h, args.themes.dark),
  ]);
  return {
    light: h.codeToHtml(args.code, { lang, theme: args.themes.light }),
    dark: h.codeToHtml(args.code, { lang, theme: args.themes.dark }),
    fallback: false,
  };
}

/** Test-only: snapshot of the language allow-list, for guardrail checks. */
export const __SUPPORTED_LANGUAGES__ = Object.freeze(
  Object.keys(LANG_LOADERS),
) as readonly string[];
