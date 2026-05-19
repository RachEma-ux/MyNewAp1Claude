/**
 * Saved-view restore-from-version-snapshot — V1+ Phase 16-γ
 * (no-deferral continuation-6 slice 50).
 *
 * Closes the remaining-punch-list rank-7 drill: version-history reads
 * (`listSavedViewVersions` / `getSavedViewVersionById`) shipped at
 * Phase 16-γ; the restore *mutation* operators reach for after
 * browsing history was never wired. `restoreSavedViewVersion` composes
 * the existing read + `updateSavedView` so the restore itself snapshots
 * the pre-restore row into a NEW version row (audit-trail preserved by
 * reuse, not re-implementation).
 *
 * Coverage:
 *   - Throws SavedViewVersionNotFoundError when the version row is
 *     absent (covers stale dashboard links + ASDB-unavailable).
 *   - Public-api re-export sweep.
 *   - tRPC router mounts the mutation with the correct shape.
 *   - Source-scan: `restoreSavedViewVersion` composes through
 *     `updateSavedView` (audit-trail invariant preserved by reuse).
 *   - Source-scan: viewKind is not restored (identity, not content).
 *   - Source-scan: visibility is normalized defensively against
 *     legacy NULL/garbage values.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import {
  restoreSavedViewVersion,
  SavedViewVersionNotFoundError,
} from "../../server/agent-studio/services/vault/saved-views.js";

describe("restoreSavedViewVersion — ASDB-unavailable / version not found", () => {
  it("throws SavedViewVersionNotFoundError when the version row is absent", async () => {
    await expect(
      restoreSavedViewVersion(99999, {
        getDb: () => null as unknown as never,
      }),
    ).rejects.toBeInstanceOf(SavedViewVersionNotFoundError);
  });

  it("the error carries the versionId for operator-facing surfacing", async () => {
    try {
      await restoreSavedViewVersion(424242, {
        getDb: () => null as unknown as never,
      });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(SavedViewVersionNotFoundError);
      expect((e as SavedViewVersionNotFoundError).versionId).toBe(424242);
      expect((e as Error).message).toContain("424242");
    }
  });
});

describe("public-api re-export sweep", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/public-api.ts",
  );
  const src = readFileSync(file, "utf8");

  it("re-exports restoreSavedViewVersion", () => {
    expect(/\brestoreSavedViewVersion\b/.test(src)).toBe(true);
  });

  it("re-exports SavedViewVersionNotFoundError", () => {
    expect(/\bSavedViewVersionNotFoundError\b/.test(src)).toBe(true);
  });
});

describe("vault router mounts the restoreSavedViewVersion mutation", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/router.ts",
  );
  const src = readFileSync(file, "utf8");

  it("registers `restoreSavedViewVersion` as a procedure", () => {
    expect(/restoreSavedViewVersion:\s*protectedProcedure/.test(src)).toBe(
      true,
    );
  });

  it("accepts a versionId integer-positive input", () => {
    const block = src.match(
      /restoreSavedViewVersion:\s*protectedProcedure[\s\S]+?\.mutation\(/,
    );
    expect(block).not.toBeNull();
    const text = block?.[0] ?? "";
    expect(/versionId:\s*z\.number\(\)\.int\(\)\.positive\(\)/.test(text)).toBe(
      true,
    );
  });

  it("maps SavedViewVersionNotFoundError to NOT_FOUND", () => {
    const block = src.match(
      /restoreSavedViewVersion:\s*protectedProcedure[\s\S]+?deleteSavedView:/,
    );
    expect(block).not.toBeNull();
    const text = block?.[0] ?? "";
    expect(/SavedViewVersionNotFoundError/.test(text)).toBe(true);
    expect(/NOT_FOUND/.test(text)).toBe(true);
  });

  it("also maps SavedViewNotFoundError to NOT_FOUND (parent deleted edge case)", () => {
    const block = src.match(
      /restoreSavedViewVersion:\s*protectedProcedure[\s\S]+?deleteSavedView:/,
    );
    expect(block).not.toBeNull();
    const text = block?.[0] ?? "";
    expect(/SavedViewNotFoundError/.test(text)).toBe(true);
  });

  it("threads the caller's user id into capturedByUserId", () => {
    const block = src.match(
      /restoreSavedViewVersion:\s*protectedProcedure[\s\S]+?deleteSavedView:/,
    );
    expect(block).not.toBeNull();
    const text = block?.[0] ?? "";
    expect(/capturedByUserId/.test(text)).toBe(true);
    expect(/ctx/.test(text)).toBe(true);
  });
});

describe("source-scan — restoreSavedViewVersion composes through updateSavedView", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/saved-views.ts",
  );
  const src = readFileSync(file, "utf8");

  const fnMatch = src.match(
    /export async function restoreSavedViewVersion[\s\S]+?\n\}\n/,
  );

  it("function exists in saved-views.ts", () => {
    expect(fnMatch).not.toBeNull();
  });

  const fnBody = fnMatch?.[0] ?? "";

  it("composes through updateSavedView (audit-trail preserved by reuse)", () => {
    expect(/return\s+updateSavedView\(/.test(fnBody)).toBe(true);
  });

  it("looks up the version snapshot via getSavedViewVersionById", () => {
    expect(/await\s+getSavedViewVersionById\(/.test(fnBody)).toBe(true);
  });

  it("throws SavedViewVersionNotFoundError when the version is absent", () => {
    expect(/throw\s+new\s+SavedViewVersionNotFoundError/.test(fnBody)).toBe(
      true,
    );
  });

  it("does NOT restore viewKind (identity, not content)", () => {
    // The composed UpdateSavedViewInput should not carry a viewKind
    // field. `UpdateSavedViewInput` itself has no `viewKind` key, but
    // a future regression could add a sibling type that does. Pin it
    // structurally inside the restore function body.
    expect(/viewKind:/.test(fnBody)).toBe(false);
  });

  it("normalizes visibility defensively (legacy NULL/garbage tolerance)", () => {
    // The defensive cast lets the restore tolerate a version row with
    // an unexpected `visibility` value without throwing — degrades to
    // "personal" (the conservative default).
    expect(/workspace_shared/.test(fnBody)).toBe(true);
    expect(/personal/.test(fnBody)).toBe(true);
  });
});
