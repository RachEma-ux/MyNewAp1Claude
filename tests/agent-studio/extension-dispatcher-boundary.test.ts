// Extension framework — boundary + capability tests.
//
// V1+ Phase 18-α. Covers:
//   - EXTENSION_* taxonomy closure (governance status / capability
//     lane / capability check)
//   - evaluateCapability pure-fn branch matrix
//   - Source-scan boundary: NO extension file other than
//     `runtime.ts` may import `dispatchMcpToolCall` (acceptance
//     criterion #5)
//   - runtime.ts MUST import the dispatcher (refactor anchor)
//   - No `process.env.*_API_KEY` reads in any extension file
//   - No `credential-resolver` imports (Plan v3 D2)

import { describe, expect, it } from "vitest";

import {
  EXTENSION_CAPABILITY_CHECKS,
  EXTENSION_CAPABILITY_LANES,
  EXTENSION_GOVERNANCE_STATUSES,
  evaluateCapability,
  isExtensionCapabilityLane,
  isExtensionGovernanceStatus,
  type ExtensionRecord,
} from "../../server/agent-studio/services/extensions/public-api.js";

function makeExt(
  overrides: Partial<ExtensionRecord> = {},
): ExtensionRecord {
  return {
    id: 1,
    workspaceId: 1,
    extensionKey: "ext-1",
    name: "Test Extension",
    version: "0.1.0",
    signingKeyId: null,
    governanceStatus: "approved",
    capabilityLanes: ["tool"],
    declaredToolNames: ["tool.a"],
    config: null,
    installedAt: new Date(),
    approvedAt: new Date(),
    disabledAt: null,
    ...overrides,
  };
}

describe("extension taxonomy", () => {
  it("EXTENSION_GOVERNANCE_STATUSES is the 5-value closed union", () => {
    expect(EXTENSION_GOVERNANCE_STATUSES).toEqual([
      "pending_approval",
      "approved",
      "rejected",
      "disabled",
      "revoked",
    ]);
  });

  it("EXTENSION_CAPABILITY_LANES is the 4-value RACT closed union", () => {
    expect(EXTENSION_CAPABILITY_LANES).toEqual([
      "retrieve",
      "assemble",
      "compose",
      "tool",
    ]);
  });

  it("EXTENSION_CAPABILITY_CHECKS is the 4-value closed union", () => {
    expect(EXTENSION_CAPABILITY_CHECKS).toEqual([
      "allowed",
      "denied_undeclared",
      "denied_revoked",
      "denied_disabled",
    ]);
  });

  it("isExtensionGovernanceStatus + isExtensionCapabilityLane narrow correctly", () => {
    expect(isExtensionGovernanceStatus("approved")).toBe(true);
    expect(isExtensionGovernanceStatus("???")).toBe(false);
    expect(isExtensionCapabilityLane("tool")).toBe(true);
    expect(isExtensionCapabilityLane("invoke")).toBe(false);
  });
});

describe("evaluateCapability (pure branch matrix)", () => {
  it("approved + declared lane + declared tool → allowed", () => {
    const r = evaluateCapability({
      extension: makeExt(),
      lane: "tool",
      toolName: "tool.a",
    });
    expect(r.check).toBe("allowed");
  });

  it("status=revoked → denied_revoked (precedence over everything)", () => {
    const r = evaluateCapability({
      extension: makeExt({ governanceStatus: "revoked" }),
      lane: "tool",
      toolName: "tool.a",
    });
    expect(r.check).toBe("denied_revoked");
  });

  it("status=disabled → denied_disabled", () => {
    const r = evaluateCapability({
      extension: makeExt({ governanceStatus: "disabled" }),
      lane: "tool",
      toolName: "tool.a",
    });
    expect(r.check).toBe("denied_disabled");
  });

  it("status=pending_approval → denied_disabled (not yet approved)", () => {
    const r = evaluateCapability({
      extension: makeExt({ governanceStatus: "pending_approval" }),
      lane: "tool",
      toolName: "tool.a",
    });
    expect(r.check).toBe("denied_disabled");
  });

  it("status=rejected → denied_disabled", () => {
    const r = evaluateCapability({
      extension: makeExt({ governanceStatus: "rejected" }),
      lane: "tool",
      toolName: "tool.a",
    });
    expect(r.check).toBe("denied_disabled");
  });

  it("undeclared lane → denied_undeclared", () => {
    const r = evaluateCapability({
      extension: makeExt({ capabilityLanes: ["retrieve"] }),
      lane: "tool",
      toolName: "tool.a",
    });
    expect(r.check).toBe("denied_undeclared");
  });

  it("undeclared toolName → denied_undeclared", () => {
    const r = evaluateCapability({
      extension: makeExt({ declaredToolNames: ["tool.b"] }),
      lane: "tool",
      toolName: "tool.a",
    });
    expect(r.check).toBe("denied_undeclared");
  });

  it("lane=tool with missing toolName → denied_undeclared", () => {
    const r = evaluateCapability({
      extension: makeExt(),
      lane: "tool",
    });
    expect(r.check).toBe("denied_undeclared");
  });

  it("lane=retrieve with declared lane → allowed (toolName not required)", () => {
    const r = evaluateCapability({
      extension: makeExt({
        capabilityLanes: ["retrieve"],
        declaredToolNames: [],
      }),
      lane: "retrieve",
    });
    expect(r.check).toBe("allowed");
  });
});

describe("extension framework — hard-rule boundary scan", () => {
  async function readFile(rel: string): Promise<string> {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    return readFileSync(
      join(__dirname, "..", "..", rel),
      "utf8",
    );
  }

  const EXTENSION_FILES = [
    "server/agent-studio/services/extensions/contracts.ts",
    "server/agent-studio/services/extensions/capability-check.ts",
    "server/agent-studio/services/extensions/manifest.ts",
    "server/agent-studio/services/extensions/public-api.ts",
  ] as const;

  it("ONLY runtime.ts may import dispatchMcpToolCall (acceptance criterion #5)", async () => {
    for (const rel of EXTENSION_FILES) {
      const src = await readFile(rel);
      expect(
        /import\s+[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
          src,
        ),
        `${rel} imports dispatchMcpToolCall directly. ALL extension code MUST route through services/extensions/runtime.ts:invokeFromExtension().`,
      ).toBe(false);
    }
  });

  it("runtime.ts MUST import dispatchMcpToolCall (refactor anchor)", async () => {
    const src = await readFile(
      "server/agent-studio/services/extensions/runtime.ts",
    );
    expect(src).toMatch(
      /import\s*\{[^}]*dispatchMcpToolCall[^}]*\}\s*from\s*["'][^"']*mcp\/dispatcher/,
    );
  });

  it("no extension file reads process.env.*_API_KEY", async () => {
    const allFiles = [
      ...EXTENSION_FILES,
      "server/agent-studio/services/extensions/runtime.ts",
    ];
    for (const rel of allFiles) {
      const src = await readFile(rel);
      const code = src
        .split("\n")
        .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
        .join("\n");
      expect(
        /process\.env\.[A-Z_]+_API_KEY/.exec(code),
        `${rel} contains a raw env read`,
      ).toBeNull();
    }
  });

  it("no extension file imports the internal credential resolver (Plan v3 D2)", async () => {
    const allFiles = [
      ...EXTENSION_FILES,
      "server/agent-studio/services/extensions/runtime.ts",
    ];
    for (const rel of allFiles) {
      const src = await readFile(rel);
      expect(
        /credential-resolver/.exec(src),
        `${rel} imports credential-resolver`,
      ).toBeNull();
    }
  });

  it("no extension file imports neo4j-driver", async () => {
    const allFiles = [
      ...EXTENSION_FILES,
      "server/agent-studio/services/extensions/runtime.ts",
    ];
    for (const rel of allFiles) {
      const src = await readFile(rel);
      expect(
        /from\s+["']neo4j-driver["']/.exec(src),
        `${rel} imports neo4j-driver`,
      ).toBeNull();
    }
  });
});
