/**
 * Phase 15 — Vault attachments service tests.
 *
 * Covers `services/vault/attachments.ts`:
 *   - pure helpers: mime classifiers + embed-snippet renderer
 *   - DB-backed CRUD: create, get, list (vault-scoped + note-scoped),
 *     link, unlink, mark-as-source-artifact
 *
 * Uses the active-key fake-DB pattern.
 */

import { describe, it, expect, vi } from "vitest";
import {
  createAttachment,
  getAttachmentById,
  listAttachments,
  linkAttachmentToNote,
  unlinkAttachmentFromNote,
  markAttachmentAsSourceArtifact,
  buildAttachmentEmbedSnippet,
  isImageMimeType,
  isPdfMimeType,
  isEmbeddableMimeType,
  AsdbUnavailableError,
  AttachmentNotFoundError,
} from "../../server/agent-studio/services/vault/attachments";

describe("mime classifiers — Phase 15", () => {
  it("isImageMimeType — true for image/*", () => {
    expect(isImageMimeType("image/png")).toBe(true);
    expect(isImageMimeType("image/jpeg")).toBe(true);
    expect(isImageMimeType("IMAGE/WEBP")).toBe(true);
  });

  it("isImageMimeType — false for non-image", () => {
    expect(isImageMimeType("application/pdf")).toBe(false);
    expect(isImageMimeType("text/markdown")).toBe(false);
  });

  it("isPdfMimeType — true for application/pdf (with or without params)", () => {
    expect(isPdfMimeType("application/pdf")).toBe(true);
    expect(isPdfMimeType("application/pdf; charset=binary")).toBe(true);
    expect(isPdfMimeType("APPLICATION/PDF")).toBe(true);
  });

  it("isPdfMimeType — false for non-pdf", () => {
    expect(isPdfMimeType("image/png")).toBe(false);
    expect(isPdfMimeType("text/plain")).toBe(false);
  });

  it("isEmbeddableMimeType — true for image + pdf, false for other", () => {
    expect(isEmbeddableMimeType("image/png")).toBe(true);
    expect(isEmbeddableMimeType("application/pdf")).toBe(true);
    expect(isEmbeddableMimeType("text/plain")).toBe(false);
  });
});

describe("buildAttachmentEmbedSnippet — Phase 15", () => {
  it("returns ![[filename]] for images", () => {
    expect(
      buildAttachmentEmbedSnippet({
        filename: "photo.png",
        mimeType: "image/png",
      }),
    ).toBe("![[photo.png]]");
  });

  it("returns ![[filename]] for PDFs", () => {
    expect(
      buildAttachmentEmbedSnippet({
        filename: "spec.pdf",
        mimeType: "application/pdf",
      }),
    ).toBe("![[spec.pdf]]");
  });

  it("returns [[filename]] for non-embeddable types", () => {
    expect(
      buildAttachmentEmbedSnippet({
        filename: "data.csv",
        mimeType: "text/csv",
      }),
    ).toBe("[[data.csv]]");
  });
});

type SelectChain = {
  from: () => SelectChain;
  where: () => SelectChain;
  orderBy: () => SelectChain;
  limit: (n: number) => Promise<Array<Record<string, unknown>>>;
};

interface FakeRow {
  id: number;
  vaultId: number;
  noteId: number | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageUri: string;
  contentHash: string;
  createdByUserId: number | null;
  isSourceArtifact: boolean;
  createdAt: Date;
}

interface FakeState {
  rows: FakeRow[];
  nextId: number;
  selectQueue: Array<"byId" | "list">;
  active: {
    attachmentId?: number;
    vaultId?: number;
    noteId?: number;
  };
  updates: Array<{ id: number; set: Record<string, unknown> }>;
}

function makeFakeDb(initial?: Partial<FakeState>) {
  const state: FakeState = {
    rows: initial?.rows ?? [],
    nextId: initial?.nextId ?? 1000,
    selectQueue: [],
    active: {},
    updates: [],
  };

  const select = vi.fn(() => {
    const chain: SelectChain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => {
        const op = state.selectQueue.shift();
        if (op === "list") {
          let rows = state.rows;
          if (state.active.vaultId !== undefined) {
            rows = rows.filter((r) => r.vaultId === state.active.vaultId);
          }
          if (state.active.noteId !== undefined) {
            rows = rows.filter((r) => r.noteId === state.active.noteId);
          }
          return {
            limit: async () =>
              rows.sort(
                (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
              ),
          } as never;
        }
        return chain;
      },
      limit: async () => {
        const op = state.selectQueue.shift();
        if (op === "byId") {
          const found = state.rows.find((r) => r.id === state.active.attachmentId);
          return found ? [found] : [];
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
      values: (vals: Record<string, unknown>) => ({
        returning: async () => {
          if (name !== "ags_vault_attachments") return [];
          const id = state.nextId++;
          const row: FakeRow = {
            id,
            vaultId: Number(vals.vaultId),
            noteId: vals.noteId == null ? null : Number(vals.noteId),
            filename: String(vals.filename),
            mimeType: String(vals.mimeType),
            sizeBytes: Number(vals.sizeBytes),
            storageUri: String(vals.storageUri),
            contentHash: String(vals.contentHash),
            createdByUserId:
              vals.createdByUserId == null
                ? null
                : Number(vals.createdByUserId),
            isSourceArtifact: Boolean(vals.isSourceArtifact ?? false),
            createdAt: new Date(),
          };
          state.rows.push(row);
          return [row];
        },
      }),
    };
  });

  const update = vi.fn((_table: unknown) => ({
    set: (vals: Record<string, unknown>) => ({
      where: async () => {
        // We don't model the WHERE clause; target whichever attachment
        // the test marked as active.
        const id = state.active.attachmentId;
        if (id == null) return;
        const target = state.rows.find((r) => r.id === id);
        if (!target) return;
        if ("noteId" in vals) {
          target.noteId = vals.noteId == null ? null : Number(vals.noteId);
        }
        if ("isSourceArtifact" in vals) {
          target.isSourceArtifact = Boolean(vals.isSourceArtifact);
        }
        state.updates.push({ id, set: vals });
      },
    }),
  }));

  const db = { select, insert, update } as unknown;
  return { db, state };
}

describe("createAttachment — Phase 15", () => {
  it("throws AsdbUnavailableError when ASDB is unavailable", async () => {
    await expect(
      createAttachment(
        {
          vaultId: 1,
          filename: "x",
          mimeType: "image/png",
          sizeBytes: 100,
          storageUri: "s3://bucket/x",
          contentHash: "h",
        },
        42,
        { getDb: () => null as never },
      ),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("inserts a row with isSourceArtifact=false by default", async () => {
    const { db, state } = makeFakeDb();
    const result = await createAttachment(
      {
        vaultId: 5,
        noteId: 200,
        filename: "diagram.png",
        mimeType: "image/png",
        sizeBytes: 4096,
        storageUri: "s3://bucket/diagram.png",
        contentHash: "abc",
      },
      42,
      { getDb: () => db as never },
    );
    expect(result.id).toBeGreaterThan(0);
    expect(result.vaultId).toBe(5);
    expect(result.noteId).toBe(200);
    expect(result.filename).toBe("diagram.png");
    expect(result.isSourceArtifact).toBe(false);
    expect(state.rows.length).toBe(1);
  });
});

describe("getAttachmentById — Phase 15", () => {
  it("returns null when ASDB is unavailable", async () => {
    const result = await getAttachmentById(1, { getDb: () => null as never });
    expect(result).toBeNull();
  });

  it("returns the row when found", async () => {
    const now = new Date();
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          vaultId: 1,
          noteId: null,
          filename: "f.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          storageUri: "s3://bucket/f.pdf",
          contentHash: "h",
          createdByUserId: 42,
          isSourceArtifact: false,
          createdAt: now,
        },
      ],
    });
    state.selectQueue.push("byId");
    state.active.attachmentId = 7;
    const result = await getAttachmentById(7, { getDb: () => db as never });
    expect(result).not.toBeNull();
    expect(result!.id).toBe(7);
    expect(result!.mimeType).toBe("application/pdf");
  });

  it("returns null when no row matches", async () => {
    const { db, state } = makeFakeDb({});
    state.selectQueue.push("byId");
    state.active.attachmentId = 999;
    const result = await getAttachmentById(999, { getDb: () => db as never });
    expect(result).toBeNull();
  });
});

describe("listAttachments — Phase 15", () => {
  it("returns [] on ASDB-unavailable", async () => {
    const result = await listAttachments(
      { vaultId: 1 },
      { getDb: () => null as never },
    );
    expect(result).toEqual([]);
  });

  it("returns [] when no scope is supplied (refuses list-all)", async () => {
    const { db } = makeFakeDb({
      rows: [
        {
          id: 7,
          vaultId: 1,
          noteId: null,
          filename: "f.png",
          mimeType: "image/png",
          sizeBytes: 100,
          storageUri: "s3://bucket/f.png",
          contentHash: "h",
          createdByUserId: null,
          isSourceArtifact: false,
          createdAt: new Date(),
        },
      ],
    });
    const result = await listAttachments({}, { getDb: () => db as never });
    expect(result).toEqual([]);
  });

  it("scopes by vaultId", async () => {
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          vaultId: 1,
          noteId: null,
          filename: "a.png",
          mimeType: "image/png",
          sizeBytes: 100,
          storageUri: "u",
          contentHash: "h1",
          createdByUserId: null,
          isSourceArtifact: false,
          createdAt: new Date(),
        },
        {
          id: 8,
          vaultId: 2,
          noteId: null,
          filename: "b.png",
          mimeType: "image/png",
          sizeBytes: 100,
          storageUri: "u",
          contentHash: "h2",
          createdByUserId: null,
          isSourceArtifact: false,
          createdAt: new Date(),
        },
      ],
    });
    state.selectQueue.push("list");
    state.active.vaultId = 1;
    const result = await listAttachments(
      { vaultId: 1 },
      { getDb: () => db as never },
    );
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(7);
  });
});

describe("linkAttachmentToNote / unlinkAttachmentFromNote — Phase 15", () => {
  it("link throws AsdbUnavailableError when ASDB is unavailable", async () => {
    await expect(
      linkAttachmentToNote(7, 200, { getDb: () => null as never }),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("link sets noteId on the attachment row", async () => {
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          vaultId: 1,
          noteId: null,
          filename: "f",
          mimeType: "image/png",
          sizeBytes: 0,
          storageUri: "",
          contentHash: "",
          createdByUserId: null,
          isSourceArtifact: false,
          createdAt: new Date(),
        },
      ],
    });
    state.selectQueue.push("byId");
    state.active.attachmentId = 7;
    const result = await linkAttachmentToNote(7, 200, {
      getDb: () => db as never,
    });
    expect(result.noteId).toBe(200);
    expect(state.rows[0].noteId).toBe(200);
  });

  it("unlink clears noteId", async () => {
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          vaultId: 1,
          noteId: 200,
          filename: "f",
          mimeType: "image/png",
          sizeBytes: 0,
          storageUri: "",
          contentHash: "",
          createdByUserId: null,
          isSourceArtifact: false,
          createdAt: new Date(),
        },
      ],
    });
    state.selectQueue.push("byId");
    state.active.attachmentId = 7;
    const result = await unlinkAttachmentFromNote(7, {
      getDb: () => db as never,
    });
    expect(result.noteId).toBeNull();
    expect(state.rows[0].noteId).toBeNull();
  });

  it("link throws AttachmentNotFoundError when the row disappears mid-flight", async () => {
    const { db, state } = makeFakeDb({});
    // No row to find on the post-update read.
    state.selectQueue.push("byId");
    state.active.attachmentId = 999;
    await expect(
      linkAttachmentToNote(999, 200, { getDb: () => db as never }),
    ).rejects.toBeInstanceOf(AttachmentNotFoundError);
  });
});

describe("markAttachmentAsSourceArtifact — Phase 15", () => {
  it("flips is_source_artifact to true", async () => {
    const { db, state } = makeFakeDb({
      rows: [
        {
          id: 7,
          vaultId: 1,
          noteId: null,
          filename: "doc.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1000,
          storageUri: "",
          contentHash: "",
          createdByUserId: null,
          isSourceArtifact: false,
          createdAt: new Date(),
        },
      ],
    });
    state.selectQueue.push("byId");
    state.active.attachmentId = 7;
    const result = await markAttachmentAsSourceArtifact(7, {
      getDb: () => db as never,
    });
    expect(result.isSourceArtifact).toBe(true);
    expect(state.rows[0].isSourceArtifact).toBe(true);
  });

  it("throws AttachmentNotFoundError when no row exists", async () => {
    const { db, state } = makeFakeDb({});
    state.selectQueue.push("byId");
    state.active.attachmentId = 999;
    await expect(
      markAttachmentAsSourceArtifact(999, { getDb: () => db as never }),
    ).rejects.toBeInstanceOf(AttachmentNotFoundError);
  });
});
