/**
 * Loaders Tests — YAML config validation
 *
 * Tests:
 * 1. Valid capabilities YAML loads OK
 * 2. Missing version rejected
 * 3. Duplicate capability keys rejected
 * 4. Valid presets YAML loads OK
 * 5. Role referencing unknown capability rejected
 * 6. Preset referencing unknown role/capability rejected
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";
import fs from "fs";
import yaml from "js-yaml";

// Mock fs to control YAML content
vi.mock("fs");
vi.mock("js-yaml");

const mockFs = vi.mocked(fs);
const mockYaml = vi.mocked(yaml);

// Import after mocks
import { loadCapabilitiesCatalog, loadWorkspaceRolePresets } from "./loaders";

// ============================================================================
// Fixtures
// ============================================================================

const validCapabilities = {
  version: 1,
  capabilities: [
    { key: "chat.send", description: "Send messages" },
    { key: "chat.history", description: "View history" },
    { key: "agents.view", description: "View agents" },
  ],
};

const validPresets = {
  version: 1,
  roles: [
    {
      name: "WorkspaceOwner",
      description: "Full control",
      isSystem: true,
      allow: ["chat.send", "chat.history", "agents.view"],
    },
    {
      name: "Viewer",
      description: "Read-only",
      isSystem: true,
      allow: ["chat.history", "agents.view"],
    },
  ],
  workspaceTypes: [
    {
      type: "team",
      description: "Team workspace",
      blockedCapabilities: [],
    },
    {
      type: "sandbox",
      description: "Sandbox workspace",
      blockedCapabilities: ["agents.view"],
    },
  ],
};

// ============================================================================
// Tests
// ============================================================================

describe("loadCapabilitiesCatalog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("yaml content");
  });

  it("loads valid capabilities YAML", () => {
    mockYaml.load.mockReturnValue(validCapabilities);

    const result = loadCapabilitiesCatalog("/test/root");
    expect(result.version).toBe(1);
    expect(result.capabilities).toHaveLength(3);
    expect(result.capabilities[0].key).toBe("chat.send");
  });

  it("rejects missing version", () => {
    mockYaml.load.mockReturnValue({
      capabilities: [{ key: "chat.send" }],
    });

    expect(() => loadCapabilitiesCatalog("/test/root")).toThrow();
  });

  it("rejects duplicate capability keys", () => {
    mockYaml.load.mockReturnValue({
      version: 1,
      capabilities: [
        { key: "chat.send", description: "Send" },
        { key: "chat.send", description: "Duplicate" },
      ],
    });

    expect(() => loadCapabilitiesCatalog("/test/root")).toThrow("Duplicate capability keys");
  });

  it("rejects empty capabilities list", () => {
    mockYaml.load.mockReturnValue({
      version: 1,
      capabilities: [],
    });

    expect(() => loadCapabilitiesCatalog("/test/root")).toThrow();
  });
});

describe("loadWorkspaceRolePresets", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("yaml content");
  });

  it("loads valid presets YAML", () => {
    // First call loads presets, second call (cross-validation) loads capabilities
    mockYaml.load
      .mockReturnValueOnce(validPresets)
      .mockReturnValueOnce(validCapabilities);

    const result = loadWorkspaceRolePresets("/test/root");
    expect(result.version).toBe(1);
    expect(result.roles).toHaveLength(2);
    expect(result.workspaceTypes).toHaveLength(2);
  });

  it("rejects role referencing unknown capability", () => {
    const badPresets = {
      ...validPresets,
      roles: [
        {
          name: "BadRole",
          isSystem: true,
          allow: ["chat.send", "nonexistent.capability"],
        },
      ],
    };

    mockYaml.load
      .mockReturnValueOnce(badPresets)
      .mockReturnValueOnce(validCapabilities);

    expect(() => loadWorkspaceRolePresets("/test/root")).toThrow(
      'Role "BadRole" references unknown capabilities: nonexistent.capability'
    );
  });

  it("rejects preset referencing unknown blocked capability", () => {
    const badPresets = {
      ...validPresets,
      workspaceTypes: [
        {
          type: "broken",
          description: "Bad preset",
          blockedCapabilities: ["totally.fake"],
        },
      ],
    };

    mockYaml.load
      .mockReturnValueOnce(badPresets)
      .mockReturnValueOnce(validCapabilities);

    expect(() => loadWorkspaceRolePresets("/test/root")).toThrow(
      'Workspace type "broken" references unknown blocked capabilities: totally.fake'
    );
  });
});
