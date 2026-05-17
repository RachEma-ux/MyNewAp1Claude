/**
 * Default graph-lens boot installer — Phase 24 §T-F.2.
 *
 * Tests the envflag-gated installer that registers 8 default lenses
 * (one per closed `GRAPH_LENS_KINDS` value).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_GRAPH_LENS_DEFINITIONS,
  maybeInstallDefaultGraphLenses,
  GRAPH_LENS_KINDS,
  isGraphLensKind,
  GRAPH_LENS_LAYOUTS,
  GRAPH_LENS_GOVERNANCE_SCOPES,
  __resetGraphLensRegistryForTests,
  listGraphLenses,
} from "../../server/agent-studio/services/graph-lens/public-api";

beforeEach(() => {
  __resetGraphLensRegistryForTests();
});

describe("DEFAULT_GRAPH_LENS_DEFINITIONS — closed-taxonomy coverage", () => {
  it("ships exactly 8 default lens definitions (one per kind)", () => {
    expect(DEFAULT_GRAPH_LENS_DEFINITIONS).toHaveLength(9);
  });

  it("each kind appears exactly once across the 8 defaults", () => {
    const kinds = DEFAULT_GRAPH_LENS_DEFINITIONS.map((d) => d.kind).sort();
    const expected = [...GRAPH_LENS_KINDS].sort();
    expect(kinds).toEqual(expected);
  });

  it("each default uses a valid closed-taxonomy layout", () => {
    for (const def of DEFAULT_GRAPH_LENS_DEFINITIONS) {
      expect(GRAPH_LENS_LAYOUTS).toContain(def.layout);
    }
  });

  it("each default uses a valid closed-taxonomy governance scope", () => {
    for (const def of DEFAULT_GRAPH_LENS_DEFINITIONS) {
      expect(GRAPH_LENS_GOVERNANCE_SCOPES).toContain(def.governanceScope);
    }
  });

  it("MCP + Governance lenses default to approver_only scope", () => {
    const mcp = DEFAULT_GRAPH_LENS_DEFINITIONS.find((d) => d.kind === "mcp");
    const gov = DEFAULT_GRAPH_LENS_DEFINITIONS.find(
      (d) => d.kind === "governance",
    );
    expect(mcp?.governanceScope).toBe("approver_only");
    expect(gov?.governanceScope).toBe("approver_only");
  });

  it("each default has a non-empty description", () => {
    for (const def of DEFAULT_GRAPH_LENS_DEFINITIONS) {
      expect(def.description).toBeTruthy();
      expect(typeof def.description).toBe("string");
      expect((def.description as string).length).toBeGreaterThan(20);
    }
  });

  it("each default id ends with _default (operator-recognizable suffix)", () => {
    for (const def of DEFAULT_GRAPH_LENS_DEFINITIONS) {
      expect(def.id).toMatch(/_default$/);
    }
  });

  it("ids are unique across the 8 defaults", () => {
    const ids = DEFAULT_GRAPH_LENS_DEFINITIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("maybeInstallDefaultGraphLenses — envflag gate", () => {
  it("no-op when env flag is missing", () => {
    const result = maybeInstallDefaultGraphLenses({ env: {} });
    expect(result.installed).toBe(false);
    expect(result.installedIds).toEqual([]);
    expect(listGraphLenses()).toEqual([]);
  });

  it("no-op when env flag is set to anything other than 'on'", () => {
    for (const value of ["off", "true", "1", "yes", ""]) {
      __resetGraphLensRegistryForTests();
      const result = maybeInstallDefaultGraphLenses({
        env: { AGS_GRAPH_LENS_DEFAULTS_INSTALL: value },
      });
      expect(result.installed).toBe(false);
      expect(result.installedIds).toEqual([]);
    }
  });

  it("installs all 8 lenses when env flag is 'on'", () => {
    const result = maybeInstallDefaultGraphLenses({
      env: { AGS_GRAPH_LENS_DEFAULTS_INSTALL: "on" },
    });
    expect(result.installed).toBe(true);
    expect(result.installedIds).toHaveLength(9);
    expect(listGraphLenses()).toHaveLength(9);
  });

  it("installedIds matches the registration order in DEFAULT_GRAPH_LENS_DEFINITIONS", () => {
    const result = maybeInstallDefaultGraphLenses({
      env: { AGS_GRAPH_LENS_DEFAULTS_INSTALL: "on" },
    });
    const expectedIds = DEFAULT_GRAPH_LENS_DEFINITIONS.map((d) => d.id);
    expect([...result.installedIds]).toEqual(expectedIds);
  });

  it("calls the registrar exactly once per definition (test-seam override)", () => {
    const calls: string[] = [];
    const result = maybeInstallDefaultGraphLenses({
      env: { AGS_GRAPH_LENS_DEFAULTS_INSTALL: "on" },
      register: (def) => {
        calls.push(def.id);
      },
    });
    expect(result.installed).toBe(true);
    expect(calls).toHaveLength(9);
    // Real registry was NOT touched (we overrode the registrar).
    expect(listGraphLenses()).toEqual([]);
  });

  it("kind narrowing: every installed kind passes isGraphLensKind", () => {
    maybeInstallDefaultGraphLenses({
      env: { AGS_GRAPH_LENS_DEFAULTS_INSTALL: "on" },
    });
    for (const def of listGraphLenses()) {
      expect(isGraphLensKind(def.kind)).toBe(true);
    }
  });
});
