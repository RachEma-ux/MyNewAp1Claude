/**
 * Phase B §T-B.6 — Saved-views → lens-kind preview wiring lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  VIEW_KIND_BLUEPRINTS,
  getViewKindBlueprint,
  getDefaultLensKindForViewKind,
} from "../../server/agent-studio/services/vault/view-kind-blueprints.js";
import { GRAPH_LENS_KINDS } from "../../server/agent-studio/services/graph-lens/contracts.js";

describe("VIEW_KIND_BLUEPRINTS defaultLensKind (T-B.6)", () => {
  it("every blueprint has a defaultLensKind property (may be null)", () => {
    for (const b of VIEW_KIND_BLUEPRINTS) {
      expect("defaultLensKind" in b).toBe(true);
    }
  });

  it.each(VIEW_KIND_BLUEPRINTS.map((b) => b.viewKind))(
    "blueprint %s defaultLensKind is either null or a known GraphLensKind",
    (viewKind) => {
      const md = getViewKindBlueprint(viewKind);
      expect(md).not.toBeNull();
      const dl = md!.defaultLensKind;
      if (dl !== null) {
        expect(GRAPH_LENS_KINDS).toContain(dl);
      }
    },
  );

  it("note_list has no canonical lens (vault-content-only)", () => {
    expect(getViewKindBlueprint("note_list")!.defaultLensKind).toBeNull();
  });

  it("entity_list previews through institutional_memory lens", () => {
    expect(getViewKindBlueprint("entity_list")!.defaultLensKind).toBe(
      "institutional_memory",
    );
  });

  it("runtime_asset_list previews through runtime lens", () => {
    expect(getViewKindBlueprint("runtime_asset_list")!.defaultLensKind).toBe(
      "runtime",
    );
  });

  it("graph_quality previews through governance lens", () => {
    expect(getViewKindBlueprint("graph_quality")!.defaultLensKind).toBe(
      "governance",
    );
  });

  it("projection_status previews through governance lens", () => {
    expect(getViewKindBlueprint("projection_status")!.defaultLensKind).toBe(
      "governance",
    );
  });

  it("getDefaultLensKindForViewKind matches the blueprint field for every kind", () => {
    for (const b of VIEW_KIND_BLUEPRINTS) {
      expect(getDefaultLensKindForViewKind(b.viewKind)).toBe(
        b.defaultLensKind,
      );
    }
  });

  it("getDefaultLensKindForViewKind returns null for unknown viewKind", () => {
    expect(getDefaultLensKindForViewKind("unknown_kind_xyz")).toBeNull();
    expect(getDefaultLensKindForViewKind("")).toBeNull();
  });

  it("note_list is the only blueprint with null defaultLensKind (vault-content-only)", () => {
    const nullKinds = VIEW_KIND_BLUEPRINTS.filter(
      (b) => b.defaultLensKind === null,
    ).map((b) => b.viewKind);
    expect(nullKinds).toEqual(["note_list"]);
  });
});
