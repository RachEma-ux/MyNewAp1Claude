/**
 * Phase 22 §T-I.41 — Vault note conflict → bridge.
 *
 * Source-scan structural test asserting `repository-asdb.ts` emits
 * `note_conflict` when the optimistic-lock check fires (latest.version
 * !== input.expectedVersion).
 *
 * Closes the second "🟡 detection state exists in DB but no observability
 * surface" item from the audit doc (#2 `note_conflict`).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const repoPath = resolve(
  __dirname,
  "../../server/agent-studio/services/vault/repository-asdb.ts",
);

describe("vault repository-asdb is wired into the bridge", () => {
  const src = readFileSync(repoPath, "utf8");

  it("imports recordFailureStateEvent from the bridge", () => {
    expect(src).toMatch(
      /import\s*\{\s*recordFailureStateEvent\s*\}\s*from\s*["'][^"']*failure-states\/observability-bridge/,
    );
  });

  it("uses the closed note_conflict kind", () => {
    expect(src).toContain('failureState: "note_conflict"');
  });

  it("emits only on the optimistic-lock conflict branch", () => {
    expect(src).toMatch(
      /latest\.version\s*!==\s*input\.expectedVersion[\s\S]{0,800}recordFailureStateEvent/,
    );
  });

  it("metadata carries noteId / expectedVersion / latestVersion / versionGap / submitterUserId", () => {
    expect(src).toContain("noteId: input.noteId");
    expect(src).toContain("expectedVersion: input.expectedVersion");
    expect(src).toContain("latestVersion: latest.version");
    expect(src).toContain("submitterUserId: userId");
    expect(src).toContain("versionGap: latest.version - input.expectedVersion");
  });

  it("sourceKind names the repo create-version path", () => {
    expect(src).toContain('sourceKind: "vault.repository.create-version"');
  });

  it("sourceId stringifies the noteId", () => {
    expect(src).toContain("sourceId: String(input.noteId)");
  });

  it("fire-and-forget — void + .catch envelope", () => {
    expect(src).toMatch(
      /void recordFailureStateEvent[\s\S]{0,1200}\.catch/,
    );
  });

  it("exactly one recordFailureStateEvent call site in this file", () => {
    const calls = src.match(/recordFailureStateEvent\(/g) ?? [];
    expect(calls).toHaveLength(1);
  });
});
