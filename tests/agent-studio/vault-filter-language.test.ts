/**
 * Bases Filter Language V1 — parser + schema unit tests.
 *
 * T-F.99 (T-F.2-filter-α). Locks the schema shape, the V1→typed
 * parser, the legacy `{ folderId }` fall-back, the
 * `extractFolderIdConstraint` helper, and the ADR-defined invariant
 * that the parser returns `null` (never throws) on invalid input.
 *
 * No DB hit, no tRPC — pure schema validation tests.
 */

import { describe, it, expect } from "vitest";
import {
  FilterConditionSchema,
  FilterDocumentSchema,
  parseFilterDocument,
  extractFolderIdConstraint,
  applyFilterDocument,
  type FilterDocument,
  type FilterableNote,
} from "../../shared/bases-filter-language.js";

describe("FilterConditionSchema — V1 discriminated union", () => {
  it("accepts folderId eq number", () => {
    const r = FilterConditionSchema.safeParse({
      field: "folderId",
      op: "eq",
      value: 42,
    });
    expect(r.success).toBe(true);
  });

  it("accepts slug eq string", () => {
    const r = FilterConditionSchema.safeParse({
      field: "slug",
      op: "eq",
      value: "my-base",
    });
    expect(r.success).toBe(true);
  });

  it("accepts title contains string", () => {
    const r = FilterConditionSchema.safeParse({
      field: "title",
      op: "contains",
      value: "draft",
    });
    expect(r.success).toBe(true);
  });

  it("accepts governanceStatus in [...]", () => {
    const r = FilterConditionSchema.safeParse({
      field: "governanceStatus",
      op: "in",
      value: ["draft", "review", "approved"],
    });
    expect(r.success).toBe(true);
  });

  it("accepts updatedAt gte/lte ISO timestamp", () => {
    const rGte = FilterConditionSchema.safeParse({
      field: "updatedAt",
      op: "gte",
      value: "2026-05-16T00:00:00.000Z",
    });
    expect(rGte.success).toBe(true);
    const rLte = FilterConditionSchema.safeParse({
      field: "updatedAt",
      op: "lte",
      value: "2026-05-17T00:00:00.000Z",
    });
    expect(rLte.success).toBe(true);
  });

  it("rejects unknown field", () => {
    const r = FilterConditionSchema.safeParse({
      field: "tag",
      op: "eq",
      value: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects wrong op for field (folderId contains)", () => {
    const r = FilterConditionSchema.safeParse({
      field: "folderId",
      op: "contains",
      value: 1,
    });
    expect(r.success).toBe(false);
  });

  it("rejects wrong value type for field (folderId string)", () => {
    const r = FilterConditionSchema.safeParse({
      field: "folderId",
      op: "eq",
      value: "42",
    });
    expect(r.success).toBe(false);
  });

  it("rejects folderId <= 0 (positive int constraint)", () => {
    const r = FilterConditionSchema.safeParse({
      field: "folderId",
      op: "eq",
      value: 0,
    });
    expect(r.success).toBe(false);
  });

  it("rejects governanceStatus with empty array", () => {
    const r = FilterConditionSchema.safeParse({
      field: "governanceStatus",
      op: "in",
      value: [],
    });
    expect(r.success).toBe(false);
  });

  it("rejects updatedAt with non-ISO string", () => {
    const r = FilterConditionSchema.safeParse({
      field: "updatedAt",
      op: "gte",
      value: "yesterday",
    });
    expect(r.success).toBe(false);
  });
});

describe("FilterDocumentSchema — version-locked document", () => {
  it("accepts version 1 with empty conditions (match-all)", () => {
    const r = FilterDocumentSchema.safeParse({
      version: 1,
      conditions: [],
    });
    expect(r.success).toBe(true);
  });

  it("accepts version 1 with mixed condition kinds", () => {
    const r = FilterDocumentSchema.safeParse({
      version: 1,
      conditions: [
        { field: "folderId", op: "eq", value: 1 },
        { field: "title", op: "contains", value: "draft" },
        {
          field: "governanceStatus",
          op: "in",
          value: ["approved"],
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing version", () => {
    const r = FilterDocumentSchema.safeParse({ conditions: [] });
    expect(r.success).toBe(false);
  });

  it("rejects wrong version (locks V1 literal)", () => {
    const r = FilterDocumentSchema.safeParse({
      version: 2,
      conditions: [],
    });
    expect(r.success).toBe(false);
  });

  it("rejects conditions array > 32 entries (DSL cap)", () => {
    const cond = { field: "title" as const, op: "contains" as const, value: "x" };
    const r = FilterDocumentSchema.safeParse({
      version: 1,
      conditions: Array.from({ length: 33 }, () => cond),
    });
    expect(r.success).toBe(false);
  });
});

describe("parseFilterDocument — lenient parser with legacy fall-back", () => {
  it("returns the typed document on a V1 input", () => {
    const out = parseFilterDocument({
      version: 1,
      conditions: [{ field: "folderId", op: "eq", value: 5 }],
    });
    expect(out).not.toBeNull();
    expect(out!.version).toBe(1);
    expect(out!.conditions).toHaveLength(1);
    expect(out!.conditions[0]).toEqual({
      field: "folderId",
      op: "eq",
      value: 5,
    });
  });

  it("projects legacy { folderId: N } into typed shape (backwards-compat)", () => {
    const out = parseFilterDocument({ folderId: 7 });
    expect(out).toEqual<FilterDocument>({
      version: 1,
      conditions: [{ field: "folderId", op: "eq", value: 7 }],
    });
  });

  it("returns null for invalid input WITHOUT throwing (ADR-defined lenient invariant)", () => {
    // The parser must NEVER throw — callers treat null as "no
    // narrowing applied". Exercising several invalid shapes.
    expect(() => parseFilterDocument(null)).not.toThrow();
    expect(() => parseFilterDocument(undefined)).not.toThrow();
    expect(() => parseFilterDocument({})).not.toThrow();
    expect(() => parseFilterDocument({ tag: "x" })).not.toThrow();
    expect(() => parseFilterDocument({ folderId: "not-a-number" })).not.toThrow();
    expect(() => parseFilterDocument([])).not.toThrow();
    expect(() => parseFilterDocument("a string")).not.toThrow();

    expect(parseFilterDocument(null)).toBeNull();
    expect(parseFilterDocument({})).toBeNull();
    expect(parseFilterDocument({ tag: "x" })).toBeNull();
    expect(parseFilterDocument({ folderId: "not-a-number" })).toBeNull();
    expect(parseFilterDocument([])).toBeNull();
    expect(parseFilterDocument("a string")).toBeNull();
  });

  it("legacy projection ignores folderId <= 0 (preserves positive-int invariant)", () => {
    expect(parseFilterDocument({ folderId: 0 })).toBeNull();
    expect(parseFilterDocument({ folderId: -1 })).toBeNull();
  });
});

describe("extractFolderIdConstraint — ζ-preview compatibility helper", () => {
  it("returns the folderId value when the document has a folderId-eq condition", () => {
    const doc = parseFilterDocument({
      version: 1,
      conditions: [
        { field: "title", op: "contains", value: "x" },
        { field: "folderId", op: "eq", value: 42 },
      ],
    });
    expect(extractFolderIdConstraint(doc)).toBe(42);
  });

  it("returns null when the document has no folderId condition", () => {
    const doc = parseFilterDocument({
      version: 1,
      conditions: [{ field: "title", op: "contains", value: "x" }],
    });
    expect(extractFolderIdConstraint(doc)).toBeNull();
  });

  it("returns null when the document itself is null (un-parsable input)", () => {
    expect(extractFolderIdConstraint(null)).toBeNull();
  });

  it("returns null on empty-conditions match-all document", () => {
    const doc = parseFilterDocument({ version: 1, conditions: [] });
    expect(extractFolderIdConstraint(doc)).toBeNull();
  });

  it("legacy { folderId: N } shape resolves through extractFolderIdConstraint", () => {
    const doc = parseFilterDocument({ folderId: 9 });
    expect(extractFolderIdConstraint(doc)).toBe(9);
  });
});

describe("applyFilterDocument — pure-function predicate (T-F.100 / filter-β)", () => {
  const notes: FilterableNote[] = [
    {
      slug: "draft-meeting",
      title: "Draft meeting notes",
      governanceStatus: "draft",
      updatedAt: "2026-05-10T12:00:00.000Z",
      folderId: 1,
    },
    {
      slug: "approved-roadmap",
      title: "Approved roadmap",
      governanceStatus: "approved",
      updatedAt: "2026-05-15T08:00:00.000Z",
      folderId: 2,
    },
    {
      slug: "no-folder",
      title: "Floating note",
      governanceStatus: "draft",
      updatedAt: "2026-05-14T00:00:00.000Z",
      // folderId omitted — not in any folder
    },
    {
      slug: "old-archive",
      title: "Old archive item",
      governanceStatus: "archived",
      updatedAt: "2025-01-01T00:00:00.000Z",
      folderId: 1,
    },
  ];

  it("null document matches everything (returns a copy, not the same ref)", () => {
    const out = applyFilterDocument(notes, null);
    expect(out).toEqual(notes);
    expect(out).not.toBe(notes);
  });

  it("empty-conditions document also matches everything", () => {
    const out = applyFilterDocument(notes, {
      version: 1,
      conditions: [],
    });
    expect(out).toHaveLength(notes.length);
  });

  it("folderId eq narrows to notes with the matching folderId only", () => {
    const out = applyFilterDocument(notes, {
      version: 1,
      conditions: [{ field: "folderId", op: "eq", value: 1 }],
    });
    expect(out.map((n) => n.slug)).toEqual(["draft-meeting", "old-archive"]);
  });

  it("folderId eq does NOT match notes with undefined / null folderId", () => {
    const out = applyFilterDocument(notes, {
      version: 1,
      conditions: [{ field: "folderId", op: "eq", value: 99 }],
    });
    expect(out).toHaveLength(0);
  });

  it("slug eq is exact-match (no substring)", () => {
    const out = applyFilterDocument(notes, {
      version: 1,
      conditions: [{ field: "slug", op: "eq", value: "draft-meeting" }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].slug).toBe("draft-meeting");

    const noMatch = applyFilterDocument(notes, {
      version: 1,
      conditions: [{ field: "slug", op: "eq", value: "draft" }],
    });
    expect(noMatch).toHaveLength(0);
  });

  it("title contains is case-insensitive substring", () => {
    const out = applyFilterDocument(notes, {
      version: 1,
      conditions: [{ field: "title", op: "contains", value: "DRAFT" }],
    });
    expect(out.map((n) => n.slug)).toEqual(["draft-meeting"]);
  });

  it("governanceStatus in narrows to any-of", () => {
    const out = applyFilterDocument(notes, {
      version: 1,
      conditions: [
        {
          field: "governanceStatus",
          op: "in",
          value: ["approved", "archived"],
        },
      ],
    });
    expect(out.map((n) => n.slug).sort()).toEqual([
      "approved-roadmap",
      "old-archive",
    ]);
  });

  it("updatedAt gte includes the bound (inclusive)", () => {
    const out = applyFilterDocument(notes, {
      version: 1,
      conditions: [
        {
          field: "updatedAt",
          op: "gte",
          value: "2026-05-14T00:00:00.000Z",
        },
      ],
    });
    expect(out.map((n) => n.slug).sort()).toEqual([
      "approved-roadmap",
      "no-folder",
    ]);
  });

  it("updatedAt lte includes the bound (inclusive)", () => {
    const out = applyFilterDocument(notes, {
      version: 1,
      conditions: [
        {
          field: "updatedAt",
          op: "lte",
          value: "2026-05-10T12:00:00.000Z",
        },
      ],
    });
    expect(out.map((n) => n.slug).sort()).toEqual([
      "draft-meeting",
      "old-archive",
    ]);
  });

  it("multiple conditions are AND-joined", () => {
    const out = applyFilterDocument(notes, {
      version: 1,
      conditions: [
        {
          field: "governanceStatus",
          op: "in",
          value: ["draft"],
        },
        { field: "folderId", op: "eq", value: 1 },
      ],
    });
    // Only draft-meeting matches both (no-folder is draft but
    // has no folderId, old-archive has folderId=1 but is archived).
    expect(out.map((n) => n.slug)).toEqual(["draft-meeting"]);
  });

  it("accepts Date instances for updatedAt (alongside string)", () => {
    const notesWithDates: FilterableNote[] = notes.map((n) => ({
      ...n,
      updatedAt: new Date(n.updatedAt as string),
    }));
    const out = applyFilterDocument(notesWithDates, {
      version: 1,
      conditions: [
        {
          field: "updatedAt",
          op: "gte",
          value: "2026-05-14T00:00:00.000Z",
        },
      ],
    });
    expect(out.map((n) => n.slug).sort()).toEqual([
      "approved-roadmap",
      "no-folder",
    ]);
  });

  it("preserves input row order (stable filter, not a sort)", () => {
    const out = applyFilterDocument(notes, {
      version: 1,
      conditions: [
        { field: "governanceStatus", op: "in", value: ["draft"] },
      ],
    });
    // The two drafts appear in their original input order.
    expect(out.map((n) => n.slug)).toEqual(["draft-meeting", "no-folder"]);
  });
});
