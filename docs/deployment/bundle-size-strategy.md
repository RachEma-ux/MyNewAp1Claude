# Bundle size strategy

The Phase 12 caveat from the production-readiness verification report
flagged five Vite bundle-size warnings — `WikiArticle`, `emacs-lisp`,
`wasm`, `cpp`, `index` — at >600 KB each. Four of those five were
Shiki language grammars. This document describes the **real fix**:
the app no longer bundles the full Shiki grammar registry. It also
describes the regression guards that keep it that way.

## Root cause

The app rendered Markdown via the `streamdown` package
(`<Streamdown>{content}</Streamdown>` in `WikiArticle.tsx`,
`Chat.tsx`, `AIChatBox.tsx`). Streamdown's compiled bundle does:

```js
import { bundledLanguages, createHighlighter } from "shiki";
```

`bundledLanguages` is a record whose values are
`() => import("@shikijs/langs/<name>")` factory functions. Vite's
analyzer walks every static `import()` call site at build time and
emits a separate chunk per language — even though the runtime only
ever loads on demand — because `import()` always defines a chunk
boundary. The result was 220+ language chunks, including the heavy
ones the readiness audit flagged: `emacs-lisp` (≈780 KB), `cpp`
(≈626 KB), `wasm` (≈622 KB), and `wolfram`.

A `components` override on `<Streamdown>` cannot fix this — the
top-level `import` happens whether or not the runtime ever calls
into that code path.

## The fix: replace Streamdown with an app-owned wrapper

Two new modules:

- **`client/src/lib/shiki/SlimShikiHighlighter.ts`** — the SOLE owner
  of every Shiki import in the codebase. It uses `shiki/core`
  (which carries no bundled grammars) plus an explicit, allow-listed
  set of literal `import("@shikijs/langs/<name>")` and
  `import("@shikijs/themes/<name>")` calls. Vite emits one chunk per
  literal — and ONLY per literal. Languages not on the allow-list
  fall back to plain text (HTML-escaped `<pre><code>`).
- **`client/src/components/markdown/AppStreamdown.tsx`** — a
  drop-in wrapper that replaces `<Streamdown>{content}</Streamdown>`.
  Internally it uses `react-markdown` directly with the same plugin
  set Streamdown configures (GFM, math, KaTeX) and routes code
  fences through `SlimShikiHighlighter`.

The three call sites — `client/src/components/AIChatBox.tsx`,
`client/src/pages/Chat.tsx`, `client/src/pages/WikiArticle.tsx` —
now import `AppStreamdown` and the `streamdown` dependency has been
removed from `package.json`.

### Allow-list

The current allow-list (see `LANG_LOADERS` in
`client/src/lib/shiki/SlimShikiHighlighter.ts`):

```
bash, c, cpp, csharp, css, diff, dockerfile, go, graphql, html, ini,
java, javascript, json, jsx, kotlin, markdown, php, python, ruby,
rust, scss, shellscript, sql, swift, toml, tsx, typescript, xml, yaml
```

Plus aliases (`js`, `ts`, `py`, `rb`, `rs`, `sh`, `zsh`, `shell`,
`yml`, `md`, `docker`, `c++`, `c#`, `cs`, `kt`, `htm`).

Themes: `github-light`, `github-dark` (lazy-loaded).

`mermaid` blocks are intentionally not in the allow-list — they are
documentation-content syntax, not runtime app behaviour. They render
as plain `<pre><code>`. A future PR can add a lazy Mermaid renderer
without touching this module.

### Adding a language

Add an entry to `LANG_LOADERS` with a literal
`import("@shikijs/langs/<name>")`. Do not introduce dynamic name
construction (`import(\`@shikijs/langs/${name}\`)`) — that re-bundles
every grammar, the exact regression we just removed.

## Two regression guards

### 1. Import-boundary check

`scripts/check-markdown-imports.ts` (wired via
`pnpm run check:markdown-imports`, also chained into
`pnpm run check:architecture`) greps the source tree and fails on:

- Any `from "streamdown"` import — should be
  `import { AppStreamdown } from "@/components/markdown/AppStreamdown"`.
- Any Shiki import (`shiki`, `shiki/core`, `shiki/engine/*`,
  `@shikijs/langs/*`, `@shikijs/themes/*`) outside
  `client/src/lib/shiki/SlimShikiHighlighter.ts`.

### 2. Bundle-budget check

`scripts/check-bundle-budget.ts` (wired via
`pnpm run check:bundle-budget`) runs after `pnpm run build`. It
walks `dist/public/assets/`, classifies each JS chunk as either
`language` (matched against the curated Shiki language id list) or
`application` (everything else), and asserts:

- max application chunk ≤ **1024 KB**
- max language chunk ≤ **1.5 MB**

The application budget catches the canonical regression we just
prevented — re-bundling Shiki via a stray `from "shiki"` would push
a non-`SlimShikiHighlighter` chunk past 1 MB.

The language budget remains lenient because individual grammars in
the allow-list are still load-bearing and Shiki upstream may grow
them. The check exists to catch genuinely-broken bundling
(accidentally inlining a worker payload into a grammar chunk),
not to flag normal grammar growth.

## Running the check

```bash
pnpm run build              # produces dist/public/assets/
pnpm run check:bundle-budget
pnpm run check:markdown-imports
```

Exit codes:

- `0` — every chunk is within budget AND no boundary violations.
- `1` — at least one violation. The script prints the diff vs budget
  and the ranked top-10 application + top-5 language chunks.
- `2` — `dist/public/assets/` is missing. Run `pnpm run build` first.

## When to raise the budget

Almost never. A new vendor that pushes the application bound is a
budget review, not a script bug. Open a separate PR that:

1. Names the new dependency.
2. Names what it replaces / why it's adopted.
3. Bumps `APP_BUDGET_BYTES` or `LANG_BUDGET_BYTES` in
   `scripts/check-bundle-budget.ts` with a justifying comment.
4. Updates this document to reflect the new ceiling.

**Do not** silence the script.
