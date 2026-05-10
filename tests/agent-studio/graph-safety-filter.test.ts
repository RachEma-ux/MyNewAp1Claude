/**
 * Phase 12 — graph context safety filter tests.
 */

import { describe, it, expect } from "vitest";
import {
  filterContextBlocks,
  type ContextBlockInput,
} from "../../server/agent-studio/services/graph/retrieval/public-api.js";

const baseBlock = (overrides: Partial<ContextBlockInput>): ContextBlockInput => ({
  id: overrides.id ?? "b1",
  kind: overrides.kind ?? "text",
  sourceKind: overrides.sourceKind ?? "vault_note",
  sourceId: overrides.sourceId ?? "1",
  governanceStatus: overrides.governanceStatus ?? "active",
  payload: overrides.payload ?? {},
  ...overrides,
});

describe("Graph context safety filter", () => {
  it("passes active blocks through with citation", () => {
    const r = filterContextBlocks([baseBlock({})], { userRole: "user" });
    expect(r.blocks.length).toBe(1);
    expect(r.blocks[0]?.citation.sourceId).toBe("1");
    expect(r.events.length).toBe(0);
  });

  it("blocks hidden governance status", () => {
    const r = filterContextBlocks([baseBlock({ governanceStatus: "hidden" })], { userRole: "user" });
    expect(r.blocks.length).toBe(0);
    expect(r.events[0]?.reason).toBe("governance_hidden");
  });

  it("blocks archived governance status", () => {
    const r = filterContextBlocks([baseBlock({ governanceStatus: "archived" })], { userRole: "user" });
    expect(r.blocks.length).toBe(0);
    expect(r.events[0]?.reason).toBe("governance_archived");
  });

  it("blocks deprecated governance status", () => {
    const r = filterContextBlocks([baseBlock({ governanceStatus: "deprecated" })], { userRole: "user" });
    expect(r.blocks.length).toBe(0);
    expect(r.events[0]?.reason).toBe("governance_archived");
  });

  it("blocks raw_extraction source kind (raw artifact policy)", () => {
    const r = filterContextBlocks([baseBlock({ sourceKind: "raw_extraction" })], { userRole: "user" });
    expect(r.blocks.length).toBe(0);
    expect(r.events[0]?.reason).toBe("raw_artifact");
  });

  it("blocks ingestion_buffer source kind", () => {
    const r = filterContextBlocks([baseBlock({ sourceKind: "ingestion_buffer" })], { userRole: "user" });
    expect(r.blocks.length).toBe(0);
    expect(r.events[0]?.reason).toBe("raw_artifact");
  });

  it("emits permission_denied when governanceStatusFilter excludes active", () => {
    const r = filterContextBlocks([baseBlock({})], {
      userRole: "user",
      governanceStatusFilter: ["archived"], // only archived
    });
    expect(r.blocks.length).toBe(0);
    expect(r.events[0]?.reason).toBe("permission_denied");
  });

  it("emits missing_citation when sourceId is empty", () => {
    const r = filterContextBlocks([baseBlock({ sourceId: "" })], { userRole: "user" });
    expect(r.blocks.length).toBe(0);
    expect(r.events[0]?.reason).toBe("missing_citation");
  });
});
