// vault router — saved-views procedure mount integrity.
//
// Locks in the 3 new procedures shipped in PR-V1-19 for the
// 16-β + 16-γ service surfaces. Source-string scan keeps the tRPC
// tree out of the test environment.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const VAULT_ROUTER_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/vault/router.ts",
);

describe("vault router — saved-views procedure imports", () => {
  const src = readFileSync(VAULT_ROUTER_PATH, "utf8");

  it("imports listVisibleSavedViewsForUser (16-β)", () => {
    expect(src).toMatch(/\blistVisibleSavedViewsForUser\b/);
  });

  it("imports listSavedViewVersions (16-γ)", () => {
    expect(src).toMatch(/\blistSavedViewVersions\b/);
  });

  it("imports getSavedViewVersionById (16-γ)", () => {
    expect(src).toMatch(/\bgetSavedViewVersionById\b/);
  });
});

describe("vault router — saved-views procedure declarations", () => {
  const src = readFileSync(VAULT_ROUTER_PATH, "utf8");

  it("declares listVisibleSavedViews procedure", () => {
    expect(src).toMatch(/\blistVisibleSavedViews\s*:\s*protectedProcedure/);
  });

  it("declares listSavedViewVersions procedure", () => {
    expect(src).toMatch(/\blistSavedViewVersions\s*:\s*protectedProcedure/);
  });

  it("declares getSavedViewVersion procedure", () => {
    expect(src).toMatch(/\bgetSavedViewVersion\s*:\s*protectedProcedure/);
  });
});

describe("vault router — visibility filter calls viewerUserId", () => {
  const src = readFileSync(VAULT_ROUTER_PATH, "utf8");

  it("passes viewerUserId into listVisibleSavedViewsForUser", () => {
    // The β-2 contract: the viewerUserId must thread from ctx.user.id
    // into the service call. Source-scan asserts the wire.
    expect(src).toMatch(/viewerUserId\s*:/);
  });

  it("anonymous (no user) is allowed — viewerUserId defaults to null", () => {
    // The Phase 16-α visibility predicate handles null viewerUserId
    // by surfacing only workspace_shared rows; the router doesn't
    // need a special anonymous branch.
    expect(src).toMatch(/userId\s*=\s*ctxAny\.user\?\.id\s*\?\?\s*null/);
  });
});

describe("vault router — γ procedures are scoped to ASDB read paths", () => {
  const src = readFileSync(VAULT_ROUTER_PATH, "utf8");

  it("listSavedViewVersions wraps a query (not mutation)", () => {
    expect(src).toMatch(
      /listSavedViewVersions\s*:\s*protectedProcedure[\s\S]+?\.query\b/,
    );
  });

  it("getSavedViewVersion wraps a query (not mutation)", () => {
    expect(src).toMatch(
      /getSavedViewVersion\s*:\s*protectedProcedure[\s\S]+?\.query\b/,
    );
  });

  it("getSavedViewVersion throws NOT_FOUND when row is absent", () => {
    expect(src).toMatch(/code:\s*["']NOT_FOUND["'][^}]*?Saved view version/);
  });
});
