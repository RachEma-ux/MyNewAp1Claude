/**
 * Phase 14 §8 — CAG source-note refs reader tests.
 *
 * Covers `getCagSourceNoteRefsForRun()` from
 * `services/graph-agent/cag-source-note-refs-reader.ts`. The reader
 * walks the requested `referenceKinds` and for each kind queries
 * `ags_runtime_note_references` left-joined back to vault notes.
 * Tests use a hand-rolled drizzle-shaped fake DB that returns a
 * pre-canned row set per `.where()` call (one call per kind).
 */

import { describe, it, expect, vi } from "vitest";
import { getCagSourceNoteRefsForRun } from "../../server/agent-studio/services/graph-agent/cag-source-note-refs-reader";

interface FakeState {
  rowsPerKind: Record<string, Array<Record<string, unknown>>>;
  whereCallCount: number;
}

function makeFakeDb(initial: FakeState["rowsPerKind"]) {
  const state: FakeState = {
    rowsPerKind: initial,
    whereCallCount: 0,
  };
  const kindOrder = Object.keys(initial);
  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      leftJoin: () => chain,
      where: async () => {
        // The reader queries once per kind; we return the pre-canned
        // rows in the order the kinds were registered.
        const kind = kindOrder[state.whereCallCount];
        state.whereCallCount++;
        return state.rowsPerKind[kind] ?? [];
      },
    };
    return chain;
  });
  return { db: { select } as unknown, state };
}

describe("getCagSourceNoteRefsForRun — Phase 14 §8", () => {
  it("returns [] when ASDB is unavailable", async () => {
    const result = await getCagSourceNoteRefsForRun(7, {
      getDb: () => null as never,
    });
    expect(result).toEqual([]);
  });

  it("returns [] when no `ags_runtime_note_references` rows exist for the run + kind", async () => {
    const { db } = makeFakeDb({ cag_block: [] });
    const result = await getCagSourceNoteRefsForRun(7, {
      getDb: () => db as never,
    });
    expect(result).toEqual([]);
  });

  it("returns one ref per row with the full vault-note join populated", async () => {
    const { db } = makeFakeDb({
      cag_block: [
        {
          noteId: 200,
          noteVersionId: 500,
          referenceKind: "cag_block",
          noteVersion: 3,
          noteSlug: "cag-overview",
          noteTitle: "CAG Overview",
        },
      ],
    });
    const result = await getCagSourceNoteRefsForRun(7, {
      getDb: () => db as never,
    });
    expect(result).toEqual([
      {
        noteId: 200,
        noteVersionId: 500,
        referenceKind: "cag_block",
        noteVersion: 3,
        noteSlug: "cag-overview",
        noteTitle: "CAG Overview",
      },
    ]);
  });

  it("dedups multiple rows for the same noteVersionId", async () => {
    const { db } = makeFakeDb({
      cag_block: [
        {
          noteId: 200,
          noteVersionId: 500,
          referenceKind: "cag_block",
          noteVersion: 3,
          noteSlug: "x",
          noteTitle: "X",
        },
        {
          noteId: 200,
          noteVersionId: 500,
          referenceKind: "cag_block",
          noteVersion: 3,
          noteSlug: "x",
          noteTitle: "X",
        },
      ],
    });
    const result = await getCagSourceNoteRefsForRun(7, {
      getDb: () => db as never,
    });
    expect(result.length).toBe(1);
    expect(result[0].noteVersionId).toBe(500);
  });

  it("preserves null-note-row shape when the FK left-join produces no match", async () => {
    const { db } = makeFakeDb({
      cag_block: [
        {
          noteId: 200,
          noteVersionId: 500,
          referenceKind: "cag_block",
          noteVersion: null,
          noteSlug: null,
          noteTitle: null,
        },
      ],
    });
    const result = await getCagSourceNoteRefsForRun(7, {
      getDb: () => db as never,
    });
    expect(result[0].noteVersion).toBeNull();
    expect(result[0].noteSlug).toBeNull();
    expect(result[0].noteTitle).toBeNull();
  });

  it("walks multiple referenceKinds in order, deduping across kinds", async () => {
    const { db, state } = makeFakeDb({
      cag_block: [
        {
          noteId: 200,
          noteVersionId: 500,
          referenceKind: "cag_block",
          noteVersion: 1,
          noteSlug: "shared",
          noteTitle: "Shared Note",
        },
      ],
      tool_result_cag_attached: [
        {
          noteId: 200,
          noteVersionId: 500,
          referenceKind: "tool_result_cag_attached",
          noteVersion: 1,
          noteSlug: "shared",
          noteTitle: "Shared Note",
        },
        {
          noteId: 201,
          noteVersionId: 501,
          referenceKind: "tool_result_cag_attached",
          noteVersion: 2,
          noteSlug: "tool-doc",
          noteTitle: "Tool Doc",
        },
      ],
    });
    const result = await getCagSourceNoteRefsForRun(7, {
      getDb: () => db as never,
      referenceKinds: ["cag_block", "tool_result_cag_attached"],
    });
    // The reader fires one query per kind, in order; the second
    // query's duplicate-noteVersionId row is dropped by the dedup,
    // and the new noteVersionId 501 row is added.
    expect(state.whereCallCount).toBe(2);
    expect(result.length).toBe(2);
    expect(result.map((r) => r.noteVersionId).sort()).toEqual([500, 501]);
  });
});
