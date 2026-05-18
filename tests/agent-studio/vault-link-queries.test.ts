/**
 * Vault — DB-backed link query tRPC + module shape.
 *
 * Keystone for migrating the WikilinksBacklinksPanel off live
 * markdown parsing. The link tables are populated by #1482; this
 * PR exposes them via tRPC so the client can query them directly.
 *
 * Behavioral testing of the JOIN queries needs a live ASDB
 * connection (covered by the integration suite). This vitest unit
 * suite locks the module shape + the router wiring.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const QUERIES = resolve(
  __dirname,
  "../../server/agent-studio/services/vault/link-queries.ts",
);
const ROUTER = resolve(
  __dirname,
  "../../server/agent-studio/services/vault/router.ts",
);
const queriesSrc = readFileSync(QUERIES, "utf8");
const routerSrc = readFileSync(ROUTER, "utf8");

describe("link-queries — module shape", () => {
  it("imports the wikilink + notes Drizzle tables", () => {
    expect(queriesSrc).toContain("agsVaultWikilinks");
    expect(queriesSrc).toContain("agsVaultNotes");
  });

  it("listBacklinksForNote uses inner JOIN on sourceNoteId", () => {
    expect(queriesSrc).toMatch(
      /listBacklinksForNote[\s\S]*?\.innerJoin\(\s*agsVaultNotes,[\s\S]*?eq\(agsVaultNotes\.id,\s*agsVaultWikilinks\.sourceNoteId\)/,
    );
  });

  it("listBacklinksForNote filters by targetNoteId", () => {
    expect(queriesSrc).toMatch(
      /listBacklinksForNote[\s\S]*?eq\(agsVaultWikilinks\.targetNoteId,\s*noteId\)/,
    );
  });

  it("listBacklinksForNote returns distinct rows (no duplicate same-source pair)", () => {
    expect(queriesSrc).toMatch(
      /listBacklinksForNote[\s\S]*?\.selectDistinct\(/,
    );
  });

  it("listOutgoingWikilinksForNote uses LEFT JOIN (surfaces unresolved)", () => {
    expect(queriesSrc).toMatch(
      /listOutgoingWikilinksForNote[\s\S]*?\.leftJoin\(/,
    );
  });

  it("listOutgoingWikilinksForNote filters by sourceNoteId", () => {
    expect(queriesSrc).toMatch(
      /listOutgoingWikilinksForNote[\s\S]*?eq\(agsVaultWikilinks\.sourceNoteId,\s*noteId\)/,
    );
  });

  it("both queries graceful no-op when getAsDb returns null", () => {
    expect(
      [...queriesSrc.matchAll(/if \(!db\)\s*return\s*\[\];/g)].length,
    ).toBeGreaterThanOrEqual(2);
  });
});

describe("router — link query tRPC wiring", () => {
  it("declares `listBacklinks` as a protected query", () => {
    expect(routerSrc).toMatch(
      /listBacklinks:\s*protectedProcedure[\s\S]*?\.query\(/,
    );
  });

  it("declares `listOutgoingWikilinks` as a protected query", () => {
    expect(routerSrc).toMatch(
      /listOutgoingWikilinks:\s*protectedProcedure[\s\S]*?\.query\(/,
    );
  });

  it("both procedures lazy-import from ./link-queries.js (cold-import hygiene)", () => {
    expect(
      [...routerSrc.matchAll(
        /await import\(\s*["']\.\/link-queries\.js["']\s*\)/g,
      )].length,
    ).toBe(2);
  });

  it("input schema validates noteId as positive integer (defends against id=0 / id=-1)", () => {
    // Both procedures use the same z.number().int().positive() shape.
    expect(
      [...routerSrc.matchAll(
        /noteId:\s*z\.number\(\)\.int\(\)\.positive\(\)/g,
      )].length,
    ).toBeGreaterThanOrEqual(2);
  });
});
