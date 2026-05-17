/**
 * VaultSavedViewsPage Lens-preview deeplink — T-B.6.
 *
 * Composes the T-F.135 URL-deeplink primitive (sender side) with
 * Phase 16's view-kind blueprint `defaultLensKind` column to give
 * operators a one-click "preview this saved view in its canonical
 * graph lens" affordance.
 *
 * Two checks beyond the usual JSX shape:
 *
 *   1. **Lockstep with the server blueprint table** — the client
 *      mirror `DEFAULT_LENS_KIND_BY_VIEW_KIND` must contain
 *      exactly the (viewKind → lensKind) pairs the server's
 *      `VIEW_KIND_BLUEPRINTS` advertises as non-null
 *      `defaultLensKind`. Drift (e.g., server adds a new
 *      viewKind with a defaultLensKind, but the client mirror
 *      doesn't update) fails this test before merge.
 *
 *   2. **URL shape matches T-F.135 receiver** — the deeplink
 *      points at `/agent-studio/graph-lens-browser?lensId=X` so
 *      the lens browser's `readLensIdFromUrl()` (T-F.135) picks
 *      it up on the receiving end without modification.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function readClient(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/pages/VaultSavedViewsPage.tsx",
    ),
    "utf8",
  );
}

function readServerBlueprints(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../server/agent-studio/services/vault/view-kind-blueprints.ts",
    ),
    "utf8",
  );
}

/**
 * Extracts the (viewKind, defaultLensKind) pairs from the server
 * blueprint table. Source-scan parser keyed on the literal text
 * pattern of the const-array entries — drift in formatting of the
 * server file would fail this parser, which is fine because the
 * client mirror has the same dependency.
 */
function parseServerBlueprintPairs(): ReadonlyArray<
  readonly [string, string | null]
> {
  const src = readServerBlueprints();
  const pairs: Array<readonly [string, string | null]> = [];
  // Match each blueprint object: `viewKind: "X", ... defaultLensKind: Y,`
  const re =
    /viewKind:\s*"([^"]+)"[\s\S]*?defaultLensKind:\s*(null|"([^"]+)")/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const viewKind = m[1];
    const lensKind = m[2] === "null" ? null : m[3];
    pairs.push([viewKind, lensKind]);
  }
  return pairs;
}

/**
 * Extracts (viewKind, lensKind) pairs from the client mirror.
 */
function parseClientMirrorPairs(): ReadonlyArray<readonly [string, string]> {
  const src = readClient();
  const block = src.match(
    /DEFAULT_LENS_KIND_BY_VIEW_KIND\s*:\s*Readonly<Record<string,\s*string>>\s*=\s*\{([\s\S]*?)\};/,
  );
  if (!block) return [];
  const pairs: Array<readonly [string, string]> = [];
  const re = /(\w+)\s*:\s*"([^"]+)"\s*,?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block[1])) !== null) {
    pairs.push([m[1], m[2]]);
  }
  return pairs;
}

describe("VaultSavedViewsPage Lens-preview deeplink (T-B.6)", () => {
  it("DEFAULT_LENS_KIND_BY_VIEW_KIND declared as Readonly<Record<string, string>>", () => {
    const src = readClient();
    expect(src).toMatch(
      /const\s+DEFAULT_LENS_KIND_BY_VIEW_KIND\s*:\s*Readonly<Record<string,\s*string>>/,
    );
  });

  it("client mirror is in lockstep with server VIEW_KIND_BLUEPRINTS.defaultLensKind", () => {
    const serverPairs = parseServerBlueprintPairs();
    const serverNonNullMap = new Map<string, string>(
      serverPairs
        .filter((p): p is readonly [string, string] => p[1] !== null)
        .map((p) => [p[0], p[1] as string]),
    );

    const clientPairs = parseClientMirrorPairs();
    const clientMap = new Map<string, string>(clientPairs);

    // Server parser must have found something — sanity check
    // against a regex that silently matches nothing.
    expect(serverPairs.length).toBeGreaterThan(0);
    expect(clientPairs.length).toBeGreaterThan(0);

    // Every server non-null mapping must be present client-side.
    for (const [viewKind, lensKind] of serverNonNullMap) {
      expect(
        clientMap.get(viewKind),
        `client mirror missing ${viewKind} (server says → ${lensKind})`,
      ).toBe(lensKind);
    }
    // Every client mapping must correspond to a server non-null
    // mapping — guards against stale client entries.
    for (const [viewKind, lensKind] of clientMap) {
      expect(
        serverNonNullMap.get(viewKind),
        `client mirror has stale entry ${viewKind} → ${lensKind} not in server blueprints`,
      ).toBe(lensKind);
    }
  });

  it("previewLensKind derived from selected saved view's viewKind", () => {
    const src = readClient();
    expect(src).toMatch(
      /previewLensKind\s*=\s*useMemo<\s*string\s*\|\s*null\s*>\([\s\S]{0,400}DEFAULT_LENS_KIND_BY_VIEW_KIND\[sv\.viewKind\]\s*\?\?\s*null/,
    );
  });

  it("Preview-in-Lens link renders only when previewLensKind is non-null", () => {
    const src = readClient();
    expect(src).toMatch(
      /\{previewLensKind\s*!==\s*null\s*&&\s*\([\s\S]{0,800}data-testid="vault-saved-views-preview-in-lens-link"/,
    );
  });

  it("Preview-in-Lens link points at /agent-studio/graph-lens-browser with ?lensId= matching T-F.135 receiver", () => {
    const src = readClient();
    expect(src).toMatch(
      /href=\{`\/agent-studio\/graph-lens-browser\?lensId=\$\{encodeURIComponent\(previewLensKind\)\}`\}/,
    );
  });

  it("Preview-in-Lens link surfaces the lens kind in label + title hint", () => {
    const src = readClient();
    expect(src).toMatch(/Preview in \{previewLensKind\} Lens/);
    expect(src).toMatch(
      /title=\{`Open the \$\{previewLensKind\} lens in the Graph Lens Browser`\}/,
    );
  });
});
