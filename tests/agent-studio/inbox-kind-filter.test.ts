/**
 * Inbox kind filter — T-F.110 (T-F.6-δ).
 *
 * Stacked on T-F.109 γ. Makes the precedent (o)-discriminator
 * surface (notificationKind) interactively usable:
 *
 * - kind filter dropdown (options derived from FULL unread byKind
 *   breakdown — countUnreadNotifications ignores the listing filter)
 * - unread-only toggle
 * - clickable rollup rows (precedent j₂ fusion: per-kind row
 *   doubles as a filter selector)
 * - filter-narrowed-empty-state messaging (precedent k)
 *
 * Source-scan locks the filter state + tRPC input plumbing +
 * filter UI + rollup-fusion + empty-state branching.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function readPanel(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/InboxPanel.tsx",
    ),
    "utf8",
  );
}

describe("Inbox kind filter δ-slice (T-F.110 / T-F.6-δ)", () => {
  it("selectedKind + unreadOnly state slices initialised to null / false", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[selectedKind,\s*setSelectedKind\][\s\S]{0,200}useState<string\s*\|\s*null>\(null\)/,
    );
    expect(src).toMatch(
      /const\s+\[unreadOnly,\s*setUnreadOnly\][\s\S]{0,150}useState<boolean>\(false\)/,
    );
  });

  it("getMyInbox input plumbs selectedKind + unreadOnly with undefined-on-default semantics", () => {
    const src = readPanel();
    expect(src).toMatch(
      /notificationKind:\s*selectedKind\s*\?\?\s*undefined/,
    );
    expect(src).toMatch(/unreadOnly:\s*unreadOnly\s*\|\|\s*undefined/);
  });

  it("kindOptions derived from full byKind breakdown + force-includes selectedKind", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+kindOptions\s*=\s*useMemo\([\s\S]{0,300}new\s+Set<string>\(Object\.keys\(unreadCount\.byKind\)\)[\s\S]{0,300}selectedKind\s*!=\s*null[\s\S]{0,100}set\.add\(selectedKind\)/,
    );
  });

  it("filter bar renders Kind dropdown + Unread-only checkbox + clear button gated on filtersActive", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid=["']inbox-filter-bar["']/);
    expect(src).toMatch(/data-testid=["']inbox-filter-kind["']/);
    expect(src).toMatch(/<option\s+value=["']{2}>All kinds<\/option>/);
    expect(src).toMatch(/data-testid=["']inbox-filter-unread-only["']/);
    expect(src).toMatch(
      /\{filtersActive\s*\?\s*\([\s\S]{0,500}data-testid=["']inbox-filter-clear["']/,
    );
  });

  it("by-kind rollup rows are clickable AND set selectedKind on click (precedent j₂ fusion)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /<button[\s\S]{0,800}onClick=\{\(\)\s*=>\s*setSelectedKind\(kind\)\}[\s\S]{0,500}data-testid=\{`inbox-by-kind-row-\$\{kind\}`\}/,
    );
    expect(src).toMatch(
      /selectedKind\s*===\s*kind[\s\S]{0,300}bg-accent/,
    );
  });

  it("filter-narrowed empty state branches separately from genuinely-empty (precedent k)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /notifications\.length\s*===\s*0\s*\?\s*\(\s*filtersActive\s*\?\s*\(/,
    );
    expect(src).toMatch(
      /data-testid=["']inbox-list-empty-filtered["']/,
    );
    expect(src).toMatch(/No notifications match the current filters/);
    expect(src).toMatch(/data-testid=["']inbox-list-empty["']/);
  });

  it("clearFilters helper resets both selectedKind AND unreadOnly", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+clearFilters\s*=\s*\(\)[\s\S]{0,200}setSelectedKind\(null\)[\s\S]{0,100}setUnreadOnly\(false\)/,
    );
  });

  it("banner refreshed γ → δ naming kind filter + unread-only live", () => {
    const src = readPanel();
    expect(src).toMatch(/Inbox δ:/);
    expect(src).toMatch(
      /kind filter[\s\S]{0,80}unread-only[\s\S]{0,80}live/,
    );
    expect(src).not.toMatch(/Inbox γ:/);
  });
});
