/**
 * Phase G §T-G.51 — Composer-mode metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  COMPOSER_MODES,
  COMPOSER_MODE_METADATA,
  getComposerModeMetadata,
} from "../../server/agent-studio/services/runtime/system-prompt-composer.js";

describe("COMPOSER_MODE_METADATA (T-G.51)", () => {
  it("has metadata for every closed-taxonomy mode", () => {
    for (const m of COMPOSER_MODES) {
      expect(COMPOSER_MODE_METADATA[m]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(COMPOSER_MODE_METADATA).length).toBe(
      COMPOSER_MODES.length,
    );
  });

  it.each(COMPOSER_MODES)(
    "%s has non-empty label + description + boolean composes + boolean throwsOnMissingPack",
    (m) => {
      const md = COMPOSER_MODE_METADATA[m];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.composes).toBe("boolean");
      expect(typeof md.throwsOnMissingPack).toBe("boolean");
    },
  );

  it.each(COMPOSER_MODES)(
    "getComposerModeMetadata(%s) returns table entry",
    (m) => {
      expect(getComposerModeMetadata(m)).toBe(COMPOSER_MODE_METADATA[m]);
    },
  );

  it("disabled is the only non-composing mode", () => {
    const noCompose = COMPOSER_MODES.filter(
      (m) => !COMPOSER_MODE_METADATA[m].composes,
    );
    expect(noCompose).toEqual(["disabled"]);
  });

  it("strict is the only mode that throws on missing pack", () => {
    const throwing = COMPOSER_MODES.filter(
      (m) => COMPOSER_MODE_METADATA[m].throwsOnMissingPack,
    );
    expect(throwing).toEqual(["strict"]);
  });

  it("throwsOnMissingPack implies composes", () => {
    for (const m of COMPOSER_MODES) {
      const md = COMPOSER_MODE_METADATA[m];
      if (md.throwsOnMissingPack) {
        expect(md.composes).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const m of COMPOSER_MODES) {
      labels.add(COMPOSER_MODE_METADATA[m].label);
    }
    expect(labels.size).toBe(COMPOSER_MODES.length);
  });
});
