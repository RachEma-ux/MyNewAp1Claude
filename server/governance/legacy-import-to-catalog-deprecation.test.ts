/**
 * Plan v3 Phase 47 — `warnLegacyImportToCatalog` unit tests.
 *
 * The helper warns once per procedure key per process. Tests verify
 * the dedup behavior and the warning message shape.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  warnLegacyImportToCatalog,
  __resetLegacyWarnSetForTests,
} from "./legacy-import-to-catalog-deprecation";

describe("warnLegacyImportToCatalog — Phase 47", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetLegacyWarnSetForTests();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("warns on the first call for a given procedure key", () => {
    warnLegacyImportToCatalog("agents.importToCatalog");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg = warnSpy.mock.calls[0][0] as string;
    expect(msg).toContain("[deprecated]");
    expect(msg).toContain("agents.importToCatalog");
    expect(msg).toContain("aiTypes.catalog.register");
    expect(msg).toContain("Phase 26.1");
    expect(msg).toContain("LEGACY_PATH_DEPRECATION.md");
  });

  it("is silent on subsequent calls for the same key", () => {
    warnLegacyImportToCatalog("agents.importToCatalog");
    warnLegacyImportToCatalog("agents.importToCatalog");
    warnLegacyImportToCatalog("agents.importToCatalog");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("warns once for each distinct procedure key", () => {
    warnLegacyImportToCatalog("agents.importToCatalog");
    warnLegacyImportToCatalog("bots.importToCatalog");
    warnLegacyImportToCatalog("models.importToCatalog");
    warnLegacyImportToCatalog("llm.importToCatalog");
    warnLegacyImportToCatalog("providers.importToCatalog");
    expect(warnSpy).toHaveBeenCalledTimes(5);
    // Subsequent calls are silent.
    warnLegacyImportToCatalog("agents.importToCatalog");
    warnLegacyImportToCatalog("bots.importToCatalog");
    expect(warnSpy).toHaveBeenCalledTimes(5);
  });

  it("__resetLegacyWarnSetForTests clears the seen set", () => {
    warnLegacyImportToCatalog("agents.importToCatalog");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    __resetLegacyWarnSetForTests();
    warnLegacyImportToCatalog("agents.importToCatalog");
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});
