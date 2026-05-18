/**
 * WikilinksBacklinksPanel — DB-backed migration lockstep.
 *
 * Validates the panel now reads from the persisted link tables
 * via `vault.listBacklinks` + `vault.listOutgoingWikilinks` (#1486)
 * rather than scanning all-vault markdown client-side.
 *
 * Source-scan only — the JSX render path is exercised by the
 * existing client-side test suite; this file locks the data-source
 * migration so a future refactor can't silently regress back to
 * the all-vault scan.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const PANEL = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/graph-workspace/WikilinksBacklinksPanel.tsx",
);
const src = readFileSync(PANEL, "utf8");

describe("WikilinksBacklinksPanel — DB-backed data source", () => {
  it("uses vault.listOutgoingWikilinks (NOT a client-side markdown scan)", () => {
    expect(src).toContain(
      "trpc.agentStudio.vault.listOutgoingWikilinks.useQuery",
    );
  });

  it("uses vault.listBacklinks", () => {
    expect(src).toContain("trpc.agentStudio.vault.listBacklinks.useQuery");
  });

  it("no longer queries the all-vault note list (listNotes)", () => {
    expect(src).not.toContain("listNotes");
  });

  it("no longer ships a client-side WIKILINK_PATTERN regex", () => {
    expect(src).not.toContain("WIKILINK_PATTERN");
  });

  it("no longer scans `noteMd` for regex matches client-side", () => {
    // The `noteMd` prop stays in the interface for backward
    // compatibility, but the body should not parse it any more.
    expect(src).not.toMatch(/\.exec\(noteMd\)/);
    expect(src).not.toMatch(/new RegExp\(WIKILINK_PATTERN\)/);
  });

  it("gates both queries on noteId > 0 (defends id=0 / id=-1)", () => {
    expect(
      [...src.matchAll(/enabled:\s*noteId\s*>\s*0/g)].length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("renders the unresolved (missing target) badge for null targetNoteId", () => {
    expect(src).toMatch(
      /targetNoteId\s*!==\s*null\s*\?[\s\S]*?onNavigateToNote\(ref\.targetNoteId!\)/,
    );
  });

  it("alias / heading anchor surface in the rendered label", () => {
    expect(src).toContain("ref.alias");
    expect(src).toContain("ref.headingAnchor");
  });

  it("backlinks render via sourceNoteId / sourceTitle / sourceSlug shape", () => {
    expect(src).toContain("backlink-${b.sourceNoteId}");
    expect(src).toContain("b.sourceTitle");
    expect(src).toContain("b.sourceSlug");
    expect(src).toMatch(/onNavigateToNote\(b\.sourceNoteId\)/);
  });

  it("backlinks empty state hints at the admin backfill", () => {
    expect(src).toMatch(
      /Notes created before link persistence shipped need a one-time admin backfill/,
    );
  });
});
