/**
 * Plugin framework manifest validator — behavioral tests.
 *
 * Slice 25 of the no-deferral catalogue (2026-05-19). First piece of
 * the V2 plugin-framework Phase 26. Tests the manifest validator's
 * acceptance + rejection paths + the granted-capabilities intersection
 * with the workspace allow-list.
 */

import { describe, it, expect } from "vitest";
import {
  PLUGIN_CAPABILITIES,
  isPluginCapability,
  PluginCapabilityDeniedError,
  validatePluginManifest,
  type PluginCapability,
  type PluginManifest,
  type ValidationContext,
} from "../../server/agent-studio/services/plugin-framework/public-api.js";

const baseCtx: ValidationContext = {
  workspaceAllowedCapabilities: [
    "read_vault",
    "read_graph",
    "register_tool",
    "emit_telemetry",
  ] as PluginCapability[],
  installedPlugins: [],
};

const baseManifest: PluginManifest = {
  id: "acme/hello-world",
  version: "0.1.0",
  displayName: "Hello World",
  capabilities: ["read_vault", "emit_telemetry"],
  entry: "index",
};

describe("plugin framework closed contracts", () => {
  it("declares 12 capabilities in the closed taxonomy", () => {
    expect(PLUGIN_CAPABILITIES.length).toBe(12);
  });

  it("isPluginCapability rejects non-string + unknown values", () => {
    expect(isPluginCapability("read_vault")).toBe(true);
    expect(isPluginCapability("unknown")).toBe(false);
    expect(isPluginCapability(42)).toBe(false);
    expect(isPluginCapability(null)).toBe(false);
  });

  it("PluginCapabilityDeniedError names the plugin + capability", () => {
    const e = new PluginCapabilityDeniedError("acme/hello", "write_graph");
    expect(e.name).toBe("PluginCapabilityDeniedError");
    expect(e.message).toContain("acme/hello");
    expect(e.message).toContain("write_graph");
  });
});

describe("validatePluginManifest — happy path", () => {
  it("accepts a well-formed manifest", () => {
    const r = validatePluginManifest(baseManifest, baseCtx);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.grantedCapabilities).toEqual(["read_vault", "emit_telemetry"]);
  });

  it("intersects manifest capabilities with workspace allow-list", () => {
    // write_graph is in the manifest but NOT in workspace allow-list.
    const r = validatePluginManifest(
      { ...baseManifest, capabilities: ["read_vault", "write_graph", "emit_telemetry"] },
      baseCtx,
    );
    expect(r.ok).toBe(true);
    expect(r.grantedCapabilities).toEqual(["read_vault", "emit_telemetry"]);
    expect(r.grantedCapabilities).not.toContain("write_graph");
  });

  it("accepts an empty capability set", () => {
    const r = validatePluginManifest(
      { ...baseManifest, capabilities: [] },
      baseCtx,
    );
    expect(r.ok).toBe(true);
    expect(r.grantedCapabilities).toEqual([]);
  });
});

describe("validatePluginManifest — rejection paths", () => {
  it("rejects non-object manifest", () => {
    const r = validatePluginManifest("not an object", baseCtx);
    expect(r.ok).toBe(false);
    expect(r.errors[0].field).toBe("(root)");
  });

  it("rejects malformed id", () => {
    const r = validatePluginManifest({ ...baseManifest, id: "BAD ID!" }, baseCtx);
    expect(r.ok).toBe(false);
    expect(r.errors.find((e) => e.field === "id")).toBeDefined();
  });

  it("rejects non-semver version", () => {
    const r = validatePluginManifest({ ...baseManifest, version: "v1" }, baseCtx);
    expect(r.ok).toBe(false);
    expect(r.errors.find((e) => e.field === "version")).toBeDefined();
  });

  it("accepts semver pre-release + build metadata", () => {
    const r = validatePluginManifest(
      { ...baseManifest, version: "1.0.0-beta.1+build.42" },
      baseCtx,
    );
    expect(r.ok).toBe(true);
  });

  it("rejects unknown capability values", () => {
    const r = validatePluginManifest(
      { ...baseManifest, capabilities: ["read_vault", "go_rogue"] },
      baseCtx,
    );
    expect(r.ok).toBe(false);
    expect(
      r.errors.find((e) => e.field === "capabilities[1]"),
    ).toBeDefined();
  });

  it("rejects missing dependency", () => {
    const r = validatePluginManifest(
      {
        ...baseManifest,
        dependencies: [{ id: "missing/dep", minVersion: "1.0.0" }],
      },
      baseCtx,
    );
    expect(r.ok).toBe(false);
    expect(r.errors[0].message).toContain("not installed in this workspace");
  });

  it("rejects dependency below min version", () => {
    const r = validatePluginManifest(
      {
        ...baseManifest,
        dependencies: [{ id: "acme/lib", minVersion: "2.0.0" }],
      },
      {
        ...baseCtx,
        installedPlugins: [{ pluginId: "acme/lib", version: "1.5.0" }],
      },
    );
    expect(r.ok).toBe(false);
    expect(r.errors[0].message).toContain("≥ v2.0.0");
  });

  it("accepts dependency at exact minVersion", () => {
    const r = validatePluginManifest(
      {
        ...baseManifest,
        dependencies: [{ id: "acme/lib", minVersion: "1.5.0" }],
      },
      {
        ...baseCtx,
        installedPlugins: [{ pluginId: "acme/lib", version: "1.5.0" }],
      },
    );
    expect(r.ok).toBe(true);
  });

  it("rejects missing entry", () => {
    const r = validatePluginManifest({ ...baseManifest, entry: "" }, baseCtx);
    expect(r.ok).toBe(false);
    expect(r.errors.find((e) => e.field === "entry")).toBeDefined();
  });
});
