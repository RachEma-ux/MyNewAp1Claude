/**
 * MR-3 sixteenth batch — services/canvas/projection-events-{reader,sink-asdb}.ts
 * source-scan (PR-V1-77).
 *
 * Phase F sixteenth batch — Lazy-loader migration shape: instead of
 * a top-level `getAsDb()` call site, both files carry a
 * `loadDefaultGetDb()` async helper that the call site invokes once
 * per drain/sink invocation. This batch:
 *
 *   - reader: renames `loadDefaultGetDb()` →
 *     `loadDefaultGetDbForWorkspace()` and threads
 *     `input.workspaceId` at the call site.
 *   - sink-asdb: renames `loadDefaultGetDb()` →
 *     `loadDefaultGetDbForWorkspace()` and threads the locally-
 *     resolved `workspaceId` (the resolver helper that LOOKS UP
 *     the workspaceId from `agsCanvases`/`agsVaults` legitimately
 *     stays on `getAsDb()` — that's the bootstrapping lookup
 *     before workspaceId is known; intentional Category C).
 *
 * Both files preserve the nullary `options.getDb` test seam so
 * existing unit tests don't break.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

describe("MR-3 sixteenth batch source-scan — projection-events-reader.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/projection-events-reader.ts",
  );
  const src = readFileSync(file, "utf8");
  const stripped = stripComments(src);

  it("default loader is renamed to loadDefaultGetDbForWorkspace and resolves getAsDbForWorkspace", () => {
    expect(
      /loadDefaultGetDbForWorkspace\s*\(\s*\)\s*\{/.test(stripped),
    ).toBe(true);
    expect(
      /mod\.getAsDbForWorkspace\b/.test(stripped),
    ).toBe(true);
  });

  it("readCanvasProjectionEventsAfter calls the loader with input.workspaceId", () => {
    expect(
      /loadDefaultGetDbForWorkspace\s*\(\s*\)\s*\)\s*\(\s*input\.workspaceId\s*\)/.test(
        stripped,
      ),
    ).toBe(true);
  });

  it("no top-level getAsDb() call sites remain (zero-arg)", () => {
    // The body of the file should NOT contain getAsDb() as a
    // zero-arg invocation. (`mod.getAsDb` *would* match `getAsDb`
    // — but that's no longer present after the migration.)
    expect(/\bgetAsDb\s*\(\s*\)/.test(stripped)).toBe(false);
  });

  it("does not reference the legacy default loader name", () => {
    // Old name was `loadDefaultGetDb`; the renamed loader is
    // `loadDefaultGetDbForWorkspace`. Allow the new name without
    // matching the old.
    expect(
      /\bloadDefaultGetDb\s*\(/.test(stripped) &&
        !/loadDefaultGetDbForWorkspace/.test(stripped.replace(/loadDefaultGetDbForWorkspace/g, "")),
    ).toBe(false);
  });

  it("options.getDb test seam still uses nullary signature", () => {
    expect(
      /readonly\s+getDb\?\:\s*\(\s*\)\s*=>/.test(stripped),
    ).toBe(true);
  });
});

describe("MR-3 sixteenth batch source-scan — projection-events-sink-asdb.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/projection-events-sink-asdb.ts",
  );
  const src = readFileSync(file, "utf8");
  const stripped = stripComments(src);

  it("default loader is renamed to loadDefaultGetDbForWorkspace and resolves getAsDbForWorkspace", () => {
    expect(
      /loadDefaultGetDbForWorkspace\s*\(\s*\)\s*:/.test(stripped),
    ).toBe(true);
    expect(
      /mod\.getAsDbForWorkspace\b/.test(stripped),
    ).toBe(true);
  });

  it("sink call site invokes the loader with the resolved workspaceId", () => {
    // Match the (await loadDefaultGetDbForWorkspace())(workspaceId)
    // shape — the workspaceId variable was resolved earlier in
    // the same async closure by the canvas→vault join.
    expect(
      /loadDefaultGetDbForWorkspace\s*\(\s*\)\s*\)\s*\(\s*workspaceId\s*\)/.test(
        stripped,
      ),
    ).toBe(true);
  });

  it("defaultResolveWorkspaceId LEGITIMATELY stays on getAsDb() (Cat C bootstrap helper)", () => {
    // The resolver looks up the workspaceId BEFORE we know it, so
    // routing it through getAsDbForWorkspace would require a
    // chicken-and-egg detour. Keep the resolver on getAsDb() and
    // document the exception.
    const resolverStart = stripped.search(
      /async\s+function\s+defaultResolveWorkspaceId\s*\(/,
    );
    expect(resolverStart).toBeGreaterThan(-1);
    const afterResolver = stripped.slice(resolverStart);
    const resolverBody = afterResolver.split(/\nasync\s+function\s+/)[0];
    expect(/\bgetAsDb\b/.test(resolverBody)).toBe(true);
  });
});
