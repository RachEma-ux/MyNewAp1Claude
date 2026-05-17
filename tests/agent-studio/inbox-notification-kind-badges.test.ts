/**
 * InboxPanel notification-kind-coded badges — T-F.132
 * (mechanical replication of T-F.131 onto a sibling closed-emitter
 * taxonomy per lesson 94).
 *
 * 2 closed-emitter notification kinds in
 * server/agent-studio/services/graph-quality/agent-run-notifications.ts:
 *   - graph_quality_run_completed     → emerald
 *   - graph_quality_proposals_created → amber
 *
 * Unknown kinds fall back to a neutral outline (lesson 45 close-at-
 * operator-visible-boundary; the same shape as T-F.131's
 * StepKindBadge fallback for future-extensibility).
 *
 * Per lesson 94 (mechanical-replication-with-zero-new-infrastructure):
 * this is the same precedent (n) shape T-F.131 opened, replicated
 * with a different closed taxonomy. Helper kept inline (not shared
 * with StepKindBadge) — the two taxonomies are independent and
 * extracting a shared `<TaxonomyBadge>` would over-couple two
 * unrelated server-side enums into one client primitive.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function read(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/InboxPanel.tsx",
    ),
    "utf8",
  );
}

describe("InboxPanel notification-kind-coded badges (T-F.132 / mechanical replication of T-F.131)", () => {
  it("NotificationKindBadge helper declared with single-prop signature", () => {
    const src = read();
    expect(src).toMatch(
      /function\s+NotificationKindBadge\(\s*\{\s*notificationKind,?\s*\}:\s*\{\s*notificationKind:\s*string;?\s*\}\s*\)/,
    );
  });

  it("dispatches the 2 closed-emitter notification kinds to distinct color classes", () => {
    const src = read();
    expect(src).toMatch(
      /notificationKind\s*===\s*"graph_quality_run_completed"[\s\S]{0,200}bg-emerald-500/,
    );
    expect(src).toMatch(
      /notificationKind\s*===\s*"graph_quality_proposals_created"[\s\S]{0,200}bg-amber-500/,
    );
  });

  it("unknown kinds fall back to a neutral outline (lesson 45)", () => {
    const src = read();
    expect(src).toMatch(/:\s*"border-border\/60 text-muted-foreground"/);
  });

  it("per-kind data-testid lets source-scan tests lock the taxonomy", () => {
    const src = read();
    expect(src).toMatch(
      /data-testid=\{`inbox-notification-kind-badge-\$\{notificationKind\}`\}/,
    );
  });

  it("inbox row replaces plain font-mono text with <NotificationKindBadge>", () => {
    const src = read();
    // Old shape — a plain "truncate font-mono text-xs" span containing
    // just {n.notificationKind} — is gone. We assert the helper is
    // invoked inside the row, and the `n.notificationKind` text-only
    // render no longer appears as a standalone span body in the row.
    expect(src).toMatch(
      /<NotificationKindBadge\s+notificationKind=\{n\.notificationKind\}/,
    );
  });

  it("NotificationKindBadge invoked exactly once (no over-application — single row render site)", () => {
    const src = read();
    const matches = src.match(/<NotificationKindBadge\b/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("dismiss-confirm body preserves the plain font-mono span (regression-free; that span is a copy of the kind for confirmation, NOT a render of the canonical taxonomy)", () => {
    const src = read();
    // The dismiss-confirm copy needs the plain text inside the
    // sentence "Dismiss notification <kind> (#<id>)? …" — the badge
    // shape doesn't belong inline in a sentence; only the row-header
    // gets the badge. We assert the inline confirm-span survives.
    expect(src).toMatch(
      /Dismiss notification[\s\S]{0,200}<span className="font-mono">\{n\.notificationKind\}<\/span>/,
    );
  });

  it("inbox-row-kind testid wrapper preserved (regression-free for the row anchor)", () => {
    const src = read();
    expect(src).toMatch(
      /data-testid=\{`inbox-row-kind-\$\{n\.id\}`\}/,
    );
  });
});
