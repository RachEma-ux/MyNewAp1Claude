/**
 * Phase R §T-R.1 — runtime config-block metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  RUNTIME_CONFIG_BLOCK_NAMES,
  RUNTIME_CONFIG_BLOCK_METADATA,
  getRuntimeConfigBlockMetadata,
} from "../../server/agent-studio/services/runtime/config-schema-version.js";

describe("RUNTIME_CONFIG_BLOCK_METADATA (T-R.1)", () => {
  it("has metadata for every closed-taxonomy block", () => {
    for (const b of RUNTIME_CONFIG_BLOCK_NAMES) {
      expect(RUNTIME_CONFIG_BLOCK_METADATA[b]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(RUNTIME_CONFIG_BLOCK_METADATA).length).toBe(
      RUNTIME_CONFIG_BLOCK_NAMES.length,
    );
  });

  it.each(RUNTIME_CONFIG_BLOCK_NAMES)(
    "%s has non-empty label + description + valid domain",
    (b) => {
      const md = RUNTIME_CONFIG_BLOCK_METADATA[b];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect([
        "agent_behavior",
        "knowledge_access",
        "tool_orchestration",
        "governance",
        "scheduling_and_status",
      ]).toContain(md.domain);
    },
  );

  it.each(RUNTIME_CONFIG_BLOCK_NAMES)(
    "getRuntimeConfigBlockMetadata(%s) returns table entry",
    (b) => {
      expect(getRuntimeConfigBlockMetadata(b)).toBe(
        RUNTIME_CONFIG_BLOCK_METADATA[b],
      );
    },
  );

  it("every domain is represented by at least one block", () => {
    const used = new Set<string>();
    for (const b of RUNTIME_CONFIG_BLOCK_NAMES) {
      used.add(RUNTIME_CONFIG_BLOCK_METADATA[b].domain);
    }
    expect(used.has("agent_behavior")).toBe(true);
    expect(used.has("knowledge_access")).toBe(true);
    expect(used.has("tool_orchestration")).toBe(true);
    expect(used.has("governance")).toBe(true);
    expect(used.has("scheduling_and_status")).toBe(true);
  });

  it("governancePolicy is the sole governance-domain block", () => {
    for (const b of RUNTIME_CONFIG_BLOCK_NAMES) {
      const md = RUNTIME_CONFIG_BLOCK_METADATA[b];
      if (md.domain === "governance") {
        expect(b).toBe("governancePolicy");
      }
    }
  });

  it("knowledgeConfig is the sole knowledge-domain block", () => {
    for (const b of RUNTIME_CONFIG_BLOCK_NAMES) {
      const md = RUNTIME_CONFIG_BLOCK_METADATA[b];
      if (md.domain === "knowledge_access") {
        expect(b).toBe("knowledgeConfig");
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const b of RUNTIME_CONFIG_BLOCK_NAMES) {
      labels.add(RUNTIME_CONFIG_BLOCK_METADATA[b].label);
    }
    expect(labels.size).toBe(RUNTIME_CONFIG_BLOCK_NAMES.length);
  });
});
