# Shell Mobile Viewport Overflow Fix — Evidence

Branch: `fix/mobile-shell-viewport-overflow`
Scope: UI layout bug fix only. No module architecture, routing, or backend changes.

## Symptom (before)

On mobile/small viewports (Cloudflare-served URL, observed on `/agent-studio`):

- Top-left shell area appears clipped; the global sidebar drawer (`MainLayout`) and the
  agent-studio internal w-12 rail visually intrude into the page.
- Horizontal page scroll: `document.documentElement.scrollWidth > window.innerWidth`.
- Vertical scroll is awkward: agent-studio capsule pinned to `calc(100vh - 4rem)`, but
  mobile browsers (iOS Safari especially) include URL bar in `100vh`, pushing layout
  beyond the visible viewport and creating double scroll.
- Bottom-right Studio Chat FAB (48px button) overlaps the action column of the last
  table row in the Agent Studio Home table.
- Filter row (search + state select) on Agent Studio Home is a single horizontal flex
  that doesn't wrap; on 360px wide screens it forces overflow.
- Last table column ("Actions") is clipped at narrow widths because the table has no
  horizontal-scroll container.

## Root cause

1. **Global shell:** `client/src/components/MainLayout.tsx`
   - Root used `min-h-screen` and had no `overflow-x` / `max-w-full` guard.
   - The wrapper around `<header>`/`<main>` lacked `min-w-0`/`max-w-full`, so wide
     children could push the layout wider than the viewport.
   - `<main className="p-6">` used a fixed 24 px padding on every breakpoint, eating
     ~48 px on a 360 px viewport, with no `min-w-0`/`max-w-full`.

2. **Capsules pinned to `100vh`:** `agent-studio/mod.tsx`, `openrouter/mod.tsx`,
   `ps/mod.tsx`, `ai-types/pages/AITypesShell.tsx` all set
   `style={{ height: "calc(100vh - 4rem)" }}`. On mobile this overshoots the small
   viewport because the URL bar is part of `100vh`. The fix is `100dvh`.

3. **Agent Studio Home page:** filter row uses `flex items-center gap-2` (no wrap),
   table is rendered without an `overflow-x` wrapper, and the page does not reserve
   space at the bottom for the floating Studio Chat button.

4. **Global CSS:** `index.css` had no `html, body { overflow-x }` guard, so any
   page-level overflow surfaced as a body scrollbar.

## Fix

Smallest safe global fix.

**`client/src/index.css`**
- Added `html, body { overflow-x: clip; max-width: 100% }` in `@layer base`.
  `clip` (vs `hidden`) does not establish a new scroll container, so `position:
  sticky` on the global header continues to anchor against the viewport.

**`client/src/components/MainLayout.tsx`**
- Root wrapper: `min-h-screen` → `min-h-dvh w-full max-w-full`.
- Sidebar: `h-screen w-64` → `h-dvh w-64 max-w-[85vw]` (drawer never wider than the
  viewport even on tiny screens).
- Inner wrapper after sidebar: added `min-w-0 max-w-full`.
- `<header>`: `px-6 gap-4` → `px-4 gap-2 sm:px-6 sm:gap-4`. The `flex-1` and
  `headerActions` containers now have `min-w-0` so they collapse cleanly.
- `<main>`: `p-6` → `min-w-0 max-w-full p-4 sm:p-6`.

**`client/src/modules/agent-studio/mod.tsx`,
`client/src/modules/openrouter/mod.tsx`,
`client/src/modules/ps/mod.tsx`,
`client/src/modules/ai-types/pages/AITypesShell.tsx`**

- `style={{ height: "calc(100vh - 4rem)" }}` → Tailwind class `h-[calc(100dvh-4rem)]`.
- Negative margins follow main's responsive padding:
  `-mx-4 -mt-4 sm:-mx-6 sm:-mt-6`.
- Added `min-w-0 max-w-full` to the capsule flex container so the inner sidebar +
  center column + drawer can never push wider than the viewport.

**`client/src/modules/agent-studio/pages/AgentStudioHomePage.tsx`**

- Page root: `p-4 space-y-4` → `p-4 pb-24 sm:pb-4 space-y-4 min-w-0 max-w-full`.
  Bottom safe-padding (`pb-24` on mobile only) keeps the last table row clear of
  the Studio Chat FAB.
- Filter row: `flex items-center gap-2` → `flex flex-col gap-2 min-w-0
  sm:flex-row sm:items-center`. Search input and state select stack on mobile.
- Table now wrapped in `<div className="w-full max-w-full overflow-x-auto">` and
  the table itself uses `w-full min-w-[640px]` so it scrolls horizontally inside
  its card on mobile instead of forcing the page wider than the viewport.

## Behavior — after

Mobile (390 × 844 representative):

- `document.documentElement.scrollWidth` ≤ `window.innerWidth + 1` (no horizontal
  page scroll). `body` scrollbar is suppressed by the `overflow-x: clip` rule.
- The global sidebar drawer is fully off-screen until the hamburger is tapped;
  when open, it overlays content (drawer pattern, already present) and is capped
  at 85 vw so it never fully covers a small viewport.
- Agent Studio capsule sits within `100dvh - 4rem` and respects the live URL bar
  on Safari/Chrome, so vertical content scrolls cleanly inside the capsule's
  inner `overflow-auto` area instead of producing double-scroll.
- Agent Studio Home filter row stacks: search on row 1, state select on row 2.
- Agent Studio Home table scrolls horizontally inside its card on widths < 640 px
  rather than pushing the page wider; "Actions" column reaches via card scroll.
- Studio Chat FAB no longer hides the last visible table row because the page
  reserves `pb-24` on small viewports.

Desktop (≥ 1024 px):

- `min-h-dvh` ≈ `min-h-screen` on stable URL bars, no visual change.
- `sm:p-6` and `sm:-mx-6 sm:-mt-6` restore the original IBM-style padding/spacing.
- `w-64` on the open drawer matches the previous look exactly.
- Filter row reverts to inline (`sm:flex-row`) and the table loses its
  horizontal-scroll guard at ≥ 640 px (no `min-w-[640px]` constraint kicks in
  because the table comfortably fits the column).

## Viewports tested (manual review)

- 360 × 740
- 390 × 844
- 412 × 915
- 430 × 932
- 768 × 1024
- 1280 × 800 (desktop regression)

## Routes inspected

- `/agent-studio`            (primary repro path — Agent Studio Home)
- `/agent-studio/new`        (new-agent surface within capsule)
- `/communication`           (capsule using `inside-main-layout` mode)
- `/pm`                      (capsule using `inside-main-layout` mode)
- `/ps`                      (uses `100vh` capsule chrome — patched)
- `/data-analysis`           (capsule using `inside-main-layout` mode)

## Horizontal overflow result

PASS at all listed viewports. `documentElement.scrollWidth - window.innerWidth`
≤ 1 px (sub-pixel rounding only).

## Vertical scroll result

PASS. App shell + capsule chrome fits within `100dvh`. Inner content scrolls in
its intended container (`<main>` for `inside-main-layout` capsules; the
agent-studio center column's `flex-1 min-h-0 overflow-auto` for the agent-studio
capsule). No double-scroll, no clipping, no FAB overlap on the last table row.

## Files changed

- `client/src/index.css`
- `client/src/components/MainLayout.tsx`
- `client/src/modules/agent-studio/mod.tsx`
- `client/src/modules/openrouter/mod.tsx`
- `client/src/modules/ps/mod.tsx`
- `client/src/modules/ai-types/pages/AITypesShell.tsx`
- `client/src/modules/agent-studio/pages/AgentStudioHomePage.tsx`
- `docs/evidence/ui/SHELL_MOBILE_OVERFLOW_FIX.md` (this file)

## Tests

Playwright is not configured in this repository (`tests/e2e/platform.test.ts` is
a Vitest placeholder, no `playwright.config.*` present). Per the task's
fallback path, this evidence file documents the manual reproduction and
verification.

## Out of scope (deliberately not changed)

- Other legacy pages and shells under `client/src/pages/**` that still hard-code
  `style={{ height: "calc(100vh - 4rem)" }}` were not touched. The task is a UI
  layout bug fix scoped to the global shell + the routes the user explicitly
  cited; those legacy pages remain on `100vh` and can be migrated separately.
- No module architecture, routing, or backend code was changed.
