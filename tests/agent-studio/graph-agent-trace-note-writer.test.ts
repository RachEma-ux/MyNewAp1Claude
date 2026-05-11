/**
 * Phase 14 §5 — runtime trace → vault note writer tests.
 *
 * Covers `exportTraceToNote()` from
 * `services/graph-agent/trace-note-writer.ts`. Uses the injectable
 * `getDb` + `exporter` options to swap a fake drizzle-shaped DB and
 * a stubbed Markdown exporter; same "active-key" fake-DB pattern as
 * the §10 pack-mutations and §5 runtime-usage recorder tests.
 */

import { describe, it, expect, vi } from "vitest";
import {
  exportTraceToNote,
  AsdbUnavailableError,
  TraceNoteAlreadyExistsError,
} from "../../server/agent-studio/services/graph-agent/trace-note-writer";

type SelectChain = {
  from: () => SelectChain;
  where: () => SelectChain;
  orderBy: () => SelectChain;
  limit: (n: number) => Promise<Array<Record<string, unknown>>>;
};

interface FakeNoteRow {
  id: number;
  vaultId: number;
  slug: string;
  title: string;
  currentVersionId: number | null;
  createdByUserId: number | null;
  folderId: number | null;
  governanceStatus: string;
}

interface FakeVersionRow {
  id: number;
  noteId: number;
  version: number;
  contentMd: string;
  contentHash: string;
  frontmatter: Record<string, unknown> | null;
  authorUserId: number | null;
  commitMessage: string | null;
}

interface FakeDbState {
  notes: FakeNoteRow[];
  versions: FakeVersionRow[];
  nextNoteId: number;
  nextVersionId: number;
  selectQueue: Array<"existingNote" | "latestVersion">;
  active: {
    vaultId?: number;
    slug?: string;
    noteId?: number;
  };
  inserts: Array<{ table: string; values: Record<string, unknown> }>;
  updates: Array<{ table: string; set: Record<string, unknown>; where: string }>;
}

function makeFakeDb(initial?: Partial<FakeDbState>) {
  const state: FakeDbState = {
    notes: initial?.notes ?? [],
    versions: initial?.versions ?? [],
    nextNoteId: initial?.nextNoteId ?? 1000,
    nextVersionId: initial?.nextVersionId ?? 5000,
    selectQueue: [],
    active: {},
    inserts: [],
    updates: [],
  };

  const select = vi.fn(() => {
    const chain: SelectChain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => {
        const op = state.selectQueue.shift();
        if (op === "existingNote") {
          const v = state.active.vaultId;
          const s = state.active.slug;
          const found = state.notes.find(
            (n) => n.vaultId === v && n.slug === s,
          );
          return found ? [{ id: found.id }] : [];
        }
        if (op === "latestVersion") {
          const nid = state.active.noteId ?? -1;
          const rows = state.versions
            .filter((vr) => vr.noteId === nid)
            .sort((a, b) => b.version - a.version);
          return rows.length > 0 ? [{ version: rows[0].version }] : [];
        }
        return [];
      },
    };
    return chain;
  });

  function tableName(t: unknown): string {
    if (!t) return "?";
    const sym = Object.getOwnPropertySymbols(t).find(
      (s) => s.description === "drizzle:Name",
    );
    if (sym) return String((t as Record<symbol, unknown>)[sym] ?? "?");
    return "?";
  }

  const insert = vi.fn((table: unknown) => {
    const name = tableName(table);
    return {
      values: (vals: Record<string, unknown>) => {
        state.inserts.push({ table: name, values: vals });
        return {
          returning: async () => {
            if (name === "ags_vault_notes") {
              const id = state.nextNoteId++;
              state.notes.push({
                id,
                vaultId: Number(vals.vaultId),
                slug: String(vals.slug),
                title: String(vals.title),
                currentVersionId: null,
                createdByUserId: vals.createdByUserId == null ? null : Number(vals.createdByUserId),
                folderId: vals.folderId == null ? null : Number(vals.folderId),
                governanceStatus: String(vals.governanceStatus ?? "active"),
              });
              return [{ id }];
            }
            if (name === "ags_vault_note_versions") {
              const id = state.nextVersionId++;
              state.versions.push({
                id,
                noteId: Number(vals.noteId),
                version: Number(vals.version),
                contentMd: String(vals.contentMd),
                contentHash: String(vals.contentHash),
                frontmatter:
                  (vals.frontmatter as Record<string, unknown> | undefined) ??
                  null,
                authorUserId:
                  vals.authorUserId == null ? null : Number(vals.authorUserId),
                commitMessage:
                  vals.commitMessage == null ? null : String(vals.commitMessage),
              });
              return [{ id }];
            }
            return [];
          },
        };
      },
    };
  });

  const update = vi.fn((table: unknown) => {
    const name = tableName(table);
    return {
      set: (vals: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push({ table: name, set: vals, where: "(opaque)" });
          // Reflect updates into the fake notes table so later reads see them.
          // We don't model the WHERE clause; in this fake we always target
          // the active note when one is set, falling back to the most-
          // recently inserted note (the new-note path doesn't set active).
          if (name === "ags_vault_notes" && vals.currentVersionId != null) {
            const targetId =
              state.active.noteId ?? state.notes[state.notes.length - 1]?.id;
            const target = state.notes.find((n) => n.id === targetId);
            if (target) {
              target.currentVersionId = Number(vals.currentVersionId);
            }
          }
          return undefined;
        },
      }),
    };
  });

  const db = { select, insert, update } as unknown;
  return { db, state };
}

function makeExporter(result: {
  runtimeRunId: number;
  graphAgentRunId: number;
  markdown: string;
} | null) {
  return vi.fn(async () => result);
}

describe("exportTraceToNote — Phase 14 §5", () => {
  it("throws AsdbUnavailableError when ASDB is unavailable", async () => {
    const exporter = makeExporter({
      runtimeRunId: 7,
      graphAgentRunId: 100,
      markdown: "# x",
    });
    await expect(
      exportTraceToNote(
        {
          runtimeRunId: 7,
          vaultId: 1,
          createdByUserId: 42,
        },
        { getDb: () => null as never, exporter },
      ),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
    expect(exporter).not.toHaveBeenCalled();
  });

  it("returns null when the exporter reports no trace for that runId", async () => {
    const { db } = makeFakeDb();
    const exporter = makeExporter(null);
    const result = await exportTraceToNote(
      { runtimeRunId: 99, vaultId: 1, createdByUserId: 42 },
      { getDb: () => db as never, exporter },
    );
    expect(result).toBeNull();
    expect(exporter).toHaveBeenCalledWith(99, expect.any(Object));
  });

  it("inserts a new note + v1 + flips currentVersionId on first export", async () => {
    const { db, state } = makeFakeDb();
    state.selectQueue.push("existingNote");
    state.active.vaultId = 5;
    state.active.slug = "graph-agent-trace-7";

    const exporter = makeExporter({
      runtimeRunId: 7,
      graphAgentRunId: 100,
      markdown: "# Graph Agent Run #7\n\nbody",
    });

    const result = await exportTraceToNote(
      {
        runtimeRunId: 7,
        vaultId: 5,
        createdByUserId: 42,
        folderId: 3,
      },
      { getDb: () => db as never, exporter },
    );

    expect(result).not.toBeNull();
    expect(result!.created).toBe(true);
    expect(result!.version).toBe(1);
    expect(result!.slug).toBe("graph-agent-trace-7");
    expect(result!.runtimeRunId).toBe(7);
    expect(result!.graphAgentRunId).toBe(100);

    // One note row + one version row.
    expect(state.notes.length).toBe(1);
    expect(state.notes[0].slug).toBe("graph-agent-trace-7");
    expect(state.notes[0].title).toBe("Graph Agent Run #7");
    expect(state.notes[0].folderId).toBe(3);
    expect(state.versions.length).toBe(1);
    expect(state.versions[0].version).toBe(1);

    // Note's currentVersionId was flipped.
    expect(state.notes[0].currentVersionId).toBe(state.versions[0].id);
  });

  it("stamps frontmatter with runtimeRunId + graphAgentRunId + redacted flag", async () => {
    const { db, state } = makeFakeDb();
    state.selectQueue.push("existingNote");
    state.active.vaultId = 5;
    state.active.slug = "graph-agent-trace-7";

    const exporter = makeExporter({
      runtimeRunId: 7,
      graphAgentRunId: 100,
      markdown: "# x",
    });

    await exportTraceToNote(
      { runtimeRunId: 7, vaultId: 5, createdByUserId: 42 },
      { getDb: () => db as never, exporter },
    );

    const fm = state.versions[0].frontmatter ?? {};
    expect(fm.runtimeRunId).toBe(7);
    expect(fm.graphAgentRunId).toBe(100);
    expect(fm.redacted).toBe(true);
    expect(typeof fm.exportedAt).toBe("string");
  });

  it("defaults redaction ON and propagates redact: false to the exporter", async () => {
    const { db, state } = makeFakeDb();
    state.selectQueue.push("existingNote");
    state.active.vaultId = 5;
    state.active.slug = "graph-agent-trace-7";

    const exporter = makeExporter({
      runtimeRunId: 7,
      graphAgentRunId: 100,
      markdown: "# x",
    });

    await exportTraceToNote(
      {
        runtimeRunId: 7,
        vaultId: 5,
        createdByUserId: 42,
        redact: false,
      },
      { getDb: () => db as never, exporter },
    );

    expect(exporter).toHaveBeenCalledWith(7, {
      title: undefined,
      redact: false,
      actorUserId: 42,
    });
    expect(state.versions[0].frontmatter?.redacted).toBe(false);
  });

  it("throws TraceNoteAlreadyExistsError on second export without overwrite", async () => {
    const { db, state } = makeFakeDb({
      notes: [
        {
          id: 200,
          vaultId: 5,
          slug: "graph-agent-trace-7",
          title: "Graph Agent Run #7",
          currentVersionId: 5000,
          createdByUserId: 42,
          folderId: null,
          governanceStatus: "active",
        },
      ],
      versions: [
        {
          id: 5000,
          noteId: 200,
          version: 1,
          contentMd: "old",
          contentHash: "h",
          frontmatter: { runtimeRunId: 7 },
          authorUserId: 42,
          commitMessage: "Initial",
        },
      ],
    });
    state.selectQueue.push("existingNote");
    state.active.vaultId = 5;
    state.active.slug = "graph-agent-trace-7";

    const exporter = makeExporter({
      runtimeRunId: 7,
      graphAgentRunId: 100,
      markdown: "# v2",
    });

    await expect(
      exportTraceToNote(
        { runtimeRunId: 7, vaultId: 5, createdByUserId: 42 },
        { getDb: () => db as never, exporter },
      ),
    ).rejects.toBeInstanceOf(TraceNoteAlreadyExistsError);

    // No new rows written.
    expect(state.notes.length).toBe(1);
    expect(state.versions.length).toBe(1);
  });

  it("appends v2 and flips currentVersionId when overwrite=true and note exists", async () => {
    const { db, state } = makeFakeDb({
      notes: [
        {
          id: 200,
          vaultId: 5,
          slug: "graph-agent-trace-7",
          title: "Graph Agent Run #7",
          currentVersionId: 5000,
          createdByUserId: 42,
          folderId: null,
          governanceStatus: "active",
        },
      ],
      versions: [
        {
          id: 5000,
          noteId: 200,
          version: 1,
          contentMd: "old",
          contentHash: "h",
          frontmatter: { runtimeRunId: 7 },
          authorUserId: 42,
          commitMessage: "Initial",
        },
      ],
    });
    state.selectQueue.push("existingNote", "latestVersion");
    state.active.vaultId = 5;
    state.active.slug = "graph-agent-trace-7";
    state.active.noteId = 200;

    const exporter = makeExporter({
      runtimeRunId: 7,
      graphAgentRunId: 100,
      markdown: "# v2 body",
    });

    const result = await exportTraceToNote(
      {
        runtimeRunId: 7,
        vaultId: 5,
        createdByUserId: 42,
        overwrite: true,
      },
      { getDb: () => db as never, exporter },
    );

    expect(result).not.toBeNull();
    expect(result!.created).toBe(false);
    expect(result!.version).toBe(2);
    expect(result!.noteId).toBe(200);

    // No new note row inserted; one new version row.
    expect(state.notes.length).toBe(1);
    expect(state.versions.length).toBe(2);
    const v2 = state.versions.find((v) => v.version === 2);
    expect(v2).toBeDefined();
    expect(v2!.contentMd).toBe("# v2 body");

    // currentVersionId pointer advanced.
    expect(state.notes[0].currentVersionId).toBe(v2!.id);
  });

  it("threads title through to both the exporter and the note title", async () => {
    const { db, state } = makeFakeDb();
    state.selectQueue.push("existingNote");
    state.active.vaultId = 5;
    state.active.slug = "graph-agent-trace-7";

    const exporter = makeExporter({
      runtimeRunId: 7,
      graphAgentRunId: 100,
      markdown: "# x",
    });

    await exportTraceToNote(
      {
        runtimeRunId: 7,
        vaultId: 5,
        createdByUserId: 42,
        title: "Investigation",
      },
      { getDb: () => db as never, exporter },
    );

    expect(exporter).toHaveBeenCalledWith(7, {
      title: "Investigation",
      redact: true,
      actorUserId: 42,
    });
    expect(state.notes[0].title).toBe("Investigation #7");
  });

  it("computes a deterministic content hash over the rendered markdown", async () => {
    const { db, state } = makeFakeDb();
    state.selectQueue.push("existingNote");
    state.active.vaultId = 5;
    state.active.slug = "graph-agent-trace-7";

    const exporter = makeExporter({
      runtimeRunId: 7,
      graphAgentRunId: 100,
      markdown: "stable-body",
    });

    await exportTraceToNote(
      { runtimeRunId: 7, vaultId: 5, createdByUserId: 42 },
      { getDb: () => db as never, exporter },
    );

    // SHA-256 of "stable-body" (hex) — keep this stable so cross-callers
    // dedup on the same trace export deterministically.
    const expected = await import("node:crypto").then((c) =>
      c.createHash("sha256").update("stable-body", "utf8").digest("hex"),
    );
    expect(state.versions[0].contentHash).toBe(expected);
  });
});
