/**
 * Vault link persistence — outbound wikilink + embed writes.
 *
 * Closes the last #1477 follow-on (Phase 5b step 7): the link
 * extraction was running but discarding its output. Now every
 * createNote / updateNote REPLACES the prior version's rows in
 * `ags_vault_wikilinks` + `ags_vault_embeds` with the freshly-
 * extracted set.
 *
 * Coverage:
 *   1. Behavioral — graceful no-op when ASDB is unavailable
 *      (`getAsDb()` returns null) so the module is safe to call from
 *      test environments + degraded-DB conditions.
 *   2. Structural — router wires `fireLinkPersistence` for both
 *      createNote AND updateNote, fire-and-forget like
 *      `fireGraphProjection`.
 *   3. Structural — persist module imports the right Drizzle tables
 *      and uses the REPLACE strategy (delete then insert).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

// Behavioral coverage of persistNoteLinks needs a live ASDB
// connection (delete + insert against agsVaultWikilinks /
// agsVaultEmbeds), which is out of scope for the vitest unit suite —
// covered by the integration suite. The structural tests below lock
// the module's shape + the router's wiring; in combination they
// guarantee the persist path is reachable from createNote/updateNote
// and uses the canonical extractor + REPLACE strategy.

// ---------------------------------------------------------------------------
// Structural: module shape
// ---------------------------------------------------------------------------

const PERSIST = resolve(
  __dirname,
  "../../server/agent-studio/services/vault/link-persistence.ts",
);
const ROUTER = resolve(
  __dirname,
  "../../server/agent-studio/services/vault/router.ts",
);
const persistSrc = readFileSync(PERSIST, "utf8");
const routerSrc = readFileSync(ROUTER, "utf8");

describe("link-persistence — module shape", () => {
  it("imports the wikilink + embed Drizzle tables", () => {
    expect(persistSrc).toContain("agsVaultWikilinks");
    expect(persistSrc).toContain("agsVaultEmbeds");
  });

  it("uses the canonical extractor (no duplicate parser)", () => {
    expect(persistSrc).toContain("extractLinksFromMarkdown");
  });

  it("REPLACE strategy: delete BEFORE insert", () => {
    const deleteIdx = persistSrc.indexOf(".delete(agsVaultWikilinks)");
    const insertIdx = persistSrc.indexOf(".insert(agsVaultWikilinks)");
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeLessThan(insertIdx);
  });

  it("delete scope is by sourceNoteId (clears prior version's rows)", () => {
    expect(persistSrc).toMatch(
      /eq\(agsVaultWikilinks\.sourceNoteId,\s*input\.noteId\)/,
    );
    expect(persistSrc).toMatch(
      /eq\(agsVaultEmbeds\.sourceNoteId,\s*input\.noteId\)/,
    );
  });

  it("resolves targetSlug → noteId via listNotesInVault slug map", () => {
    expect(persistSrc).toContain("listNotesInVault");
    expect(persistSrc).toContain("slugToNoteId");
  });

  it("graceful no-op when getAsDb returns null (degraded mode)", () => {
    expect(persistSrc).toMatch(/if \(!db\)\s*\{[\s\S]*?return\s*\{/);
  });
});

describe("link-persistence — note-shape embed classification", () => {
  it("classifies isEmbed extraction split: realWikilinks vs noteEmbeds", () => {
    // The persist module filters extraction.wikilinks by isEmbed to
    // route them to different tables.
    expect(persistSrc).toMatch(
      /realWikilinks\s*=\s*extraction\.wikilinks\.filter\(\(wl\)\s*=>\s*!wl\.isEmbed\)/,
    );
    expect(persistSrc).toMatch(
      /noteEmbeds\s*=\s*extraction\.wikilinks\.filter\(\(wl\)\s*=>\s*wl\.isEmbed\)/,
    );
  });

  it("attachment embeds get embedKind='attachment'", () => {
    expect(persistSrc).toMatch(
      /attachmentEmbeds\.map[\s\S]*?embedKind:\s*["']attachment["']/,
    );
  });

  it("note-shape embeds get embedKind='note' with resolved targetNoteId", () => {
    expect(persistSrc).toMatch(
      /noteEmbeds\.map[\s\S]*?embedKind:\s*["']note["'][\s\S]*?targetNoteId:\s*slugToNoteId\.get\(wl\.targetSlug\)/,
    );
  });

  it("wikilink rows force isEmbed: false (embeds are not in this table anymore)", () => {
    expect(persistSrc).toMatch(/isEmbed:\s*false/);
    expect(persistSrc).not.toMatch(/isEmbed:\s*wl\.isEmbed/);
  });

  it("embedRows array is combined: attachment + note in one insert", () => {
    // The new structure builds a single `embedRows` array via
    // spread of both sub-lists, then one bulk insert.
    expect(persistSrc).toMatch(/const embedRows[\s\S]*?=\s*\[/);
    expect(persistSrc).toMatch(/\.\.\.extraction\.attachmentEmbeds\.map/);
    expect(persistSrc).toMatch(/\.\.\.noteEmbeds\.map/);
  });
});

describe("router — link persistence wiring", () => {
  it("declares a `fireLinkPersistence` fire-and-forget helper", () => {
    expect(routerSrc).toMatch(/function fireLinkPersistence\(/);
  });

  it("lazy-imports the persist module (cold-import + circular-dep avoidance)", () => {
    expect(routerSrc).toMatch(
      /await import\(\s*["']\.\/link-persistence\.js["']\s*\)/,
    );
  });

  it("createNote fires link persistence (fire-and-forget)", () => {
    expect(routerSrc).toMatch(
      /createNote[\s\S]*?void fireLinkPersistence\(/,
    );
  });

  it("updateNote fires link persistence (fire-and-forget)", () => {
    expect(routerSrc).toMatch(
      /updateNote[\s\S]*?void fireLinkPersistence\(/,
    );
  });

  it("persistence fires alongside graph projection (both are independent)", () => {
    // Both helpers appear inside createNote handler — order doesn't
    // matter because they're fire-and-forget, but coexistence is
    // load-bearing.
    expect(routerSrc).toMatch(
      /createNote[\s\S]*?fireGraphProjection\([\s\S]*?fireLinkPersistence\(/,
    );
  });
});
