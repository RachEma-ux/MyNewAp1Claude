/**
 * Phase G §T-G.66 — `summarizeKnowledgeUnits` + tuple promotion of
 * `NormalizedKnowledgeUnitType`.
 *
 * 19th instantiation of the lesson-30 aggregator-pair pattern.
 */

import { describe, expect, it } from "vitest";
import {
  summarizeKnowledgeUnits,
  type SummarizeKnowledgeUnitsInput,
} from "../../server/agent-studio/services/ingestion/knowledge-unit-summary.js";
import {
  NORMALIZED_KNOWLEDGE_UNIT_TYPES,
  type NormalizedKnowledgeUnitType,
} from "../../server/agent-studio/services/ingestion/types.js";

function makeRow(
  overrides: Partial<SummarizeKnowledgeUnitsInput> = {},
): SummarizeKnowledgeUnitsInput {
  return {
    workspaceId: 1,
    sourceId: 1,
    parentUnitId: null,
    unitType: "text",
    contentLength: 0,
    ...overrides,
  };
}

describe("NORMALIZED_KNOWLEDGE_UNIT_TYPES — closed-taxonomy invariant", () => {
  it("contains exactly 10 values", () => {
    expect(NORMALIZED_KNOWLEDGE_UNIT_TYPES.length).toBe(10);
  });

  it("includes all D-NKU-2 enum values", () => {
    expect(new Set(NORMALIZED_KNOWLEDGE_UNIT_TYPES)).toEqual(
      new Set<NormalizedKnowledgeUnitType>([
        "text",
        "markdown_section",
        "html_block",
        "json_object",
        "pdf_page",
        "code_function",
        "code_class",
        "table_row",
        "tool_knowledge",
        "extracted_artifact",
      ]),
    );
  });
});

describe("summarizeKnowledgeUnits — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeKnowledgeUnits([]);
    expect(s.total).toBe(0);
    expect(s.unknownUnitTypeCount).toBe(0);
    expect(s.withParentCount).toBe(0);
    expect(s.distinctSourceCount).toBe(0);
    expect(s.distinctWorkspaceCount).toBe(0);
    expect(s.contentLengthStats).toBeNull();
  });

  it("byUnitType carries every closed type at 0", () => {
    const s = summarizeKnowledgeUnits([]);
    for (const t of NORMALIZED_KNOWLEDGE_UNIT_TYPES) {
      expect(s.byUnitType[t]).toBe(0);
    }
  });
});

describe("summarizeKnowledgeUnits — type partition", () => {
  it("counts each type correctly across the 10-value enum", () => {
    const s = summarizeKnowledgeUnits(
      NORMALIZED_KNOWLEDGE_UNIT_TYPES.map((t) => makeRow({ unitType: t })),
    );
    for (const t of NORMALIZED_KNOWLEDGE_UNIT_TYPES) {
      expect(s.byUnitType[t]).toBe(1);
    }
    expect(s.total).toBe(NORMALIZED_KNOWLEDGE_UNIT_TYPES.length);
  });

  it("byUnitType sums to total minus unknownUnitTypeCount", () => {
    const s = summarizeKnowledgeUnits([
      makeRow({ unitType: "text" }),
      makeRow({ unitType: "markdown_section" }),
      makeRow({ unitType: "future_type_we_dont_know" }),
    ]);
    let sum = 0;
    for (const t of NORMALIZED_KNOWLEDGE_UNIT_TYPES) sum += s.byUnitType[t];
    expect(sum).toBe(s.total - s.unknownUnitTypeCount);
  });
});

describe("summarizeKnowledgeUnits — hierarchy gauge", () => {
  it("withParentCount counts non-null parentUnitId", () => {
    const s = summarizeKnowledgeUnits([
      makeRow({ parentUnitId: null }),
      makeRow({ parentUnitId: 0 }), // 0 is a valid id, non-null
      makeRow({ parentUnitId: 5 }),
    ]);
    expect(s.withParentCount).toBe(2);
  });
});

describe("summarizeKnowledgeUnits — distinct gauges", () => {
  it("tracks distinct sourceId values", () => {
    const s = summarizeKnowledgeUnits([
      makeRow({ sourceId: 1 }),
      makeRow({ sourceId: 1 }),
      makeRow({ sourceId: 2 }),
    ]);
    expect(s.distinctSourceCount).toBe(2);
  });

  it("tracks distinct workspaceId values", () => {
    const s = summarizeKnowledgeUnits([
      makeRow({ workspaceId: 1 }),
      makeRow({ workspaceId: 2 }),
      makeRow({ workspaceId: 3 }),
    ]);
    expect(s.distinctWorkspaceCount).toBe(3);
  });
});

describe("summarizeKnowledgeUnits — content-length stats", () => {
  it("computes stats over content lengths across all rows", () => {
    const s = summarizeKnowledgeUnits([
      makeRow({ contentLength: 100 }),
      makeRow({ contentLength: 200 }),
      makeRow({ contentLength: 300 }),
    ]);
    expect(s.contentLengthStats!.count).toBe(3);
    expect(s.contentLengthStats!.sum).toBe(600);
    expect(s.contentLengthStats!.mean).toBe(200);
    expect(s.contentLengthStats!.min).toBe(100);
    expect(s.contentLengthStats!.max).toBe(300);
  });

  it("zero-length content is a valid value (not skipped)", () => {
    const s = summarizeKnowledgeUnits([
      makeRow({ contentLength: 0 }),
      makeRow({ contentLength: 0 }),
    ]);
    expect(s.contentLengthStats!.count).toBe(2);
    expect(s.contentLengthStats!.sum).toBe(0);
  });
});

describe("summarizeKnowledgeUnits — schema drift", () => {
  it("partitions unknown unitType out of byUnitType", () => {
    const s = summarizeKnowledgeUnits([
      makeRow({ unitType: "text" }),
      makeRow({ unitType: "future_type" }),
    ]);
    expect(s.unknownUnitTypeCount).toBe(1);
    expect(s.byUnitType.text).toBe(1);
    let sum = 0;
    for (const t of NORMALIZED_KNOWLEDGE_UNIT_TYPES)
      sum += s.byUnitType[t];
    expect(sum).toBe(1);
  });
});
