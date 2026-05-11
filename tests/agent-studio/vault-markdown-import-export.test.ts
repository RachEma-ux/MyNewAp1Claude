/**
 * Phase 15 — Markdown import + export tests.
 *
 * Covers `parseMarkdownBlob`, `renderNoteAsMarkdown`, and
 * `exportNoteAsMarkdown` from
 * `services/vault/markdown-import-export.ts`. Pure-function tests
 * for the parser + renderer; the exporter uses an in-memory
 * VaultRepository fake.
 */

import { describe, it, expect } from "vitest";
import {
  parseMarkdownBlob,
  renderNoteAsMarkdown,
  exportNoteAsMarkdown,
} from "../../server/agent-studio/services/vault/markdown-import-export";
import type {
  VaultRepository,
  NoteSelectByIdResult,
  NoteVersionSelectResult,
} from "../../server/agent-studio/services/vault/repository";

describe("parseMarkdownBlob — Phase 15", () => {
  it("returns content + empty frontmatter when no preamble present", () => {
    const result = parseMarkdownBlob("# Hello\n\nbody");
    expect(result.frontmatter).toEqual({});
    expect(result.contentMd).toBe("# Hello\n\nbody");
  });

  it("parses string + number + boolean + null scalars", () => {
    const result = parseMarkdownBlob(
      `---\ntitle: My Note\ncount: 42\nready: true\ntag: null\n---\nbody`,
    );
    expect(result.frontmatter).toEqual({
      title: "My Note",
      count: 42,
      ready: true,
      tag: null,
    });
  });

  it("parses JSON-shaped arrays and objects", () => {
    const result = parseMarkdownBlob(
      `---\ntags: ["a","b","c"]\nmeta: {"x":1,"y":"z"}\n---\nbody`,
    );
    expect(result.frontmatter.tags).toEqual(["a", "b", "c"]);
    expect(result.frontmatter.meta).toEqual({ x: 1, y: "z" });
  });

  it("strips JSON-quoted strings back to bare strings", () => {
    const result = parseMarkdownBlob(`---\ntitle: "has: colon"\n---\nbody`);
    expect(result.frontmatter.title).toBe("has: colon");
  });

  it("ignores blank lines and lines without a colon", () => {
    const result = parseMarkdownBlob(
      `---\ntitle: ok\n\nbroken line\n---\nbody`,
    );
    expect(result.frontmatter).toEqual({ title: "ok" });
  });

  it("preserves the body verbatim after the closing delimiter", () => {
    const result = parseMarkdownBlob(`---\nx: y\n---\n# Heading\n\nparagraph`);
    expect(result.contentMd).toBe("# Heading\n\nparagraph");
  });
});

describe("renderNoteAsMarkdown — Phase 15", () => {
  it("renders an empty body verbatim when frontmatter is empty", () => {
    expect(renderNoteAsMarkdown({ contentMd: "hello" })).toBe("hello");
  });

  it("renders a YAML-shaped preamble for scalar frontmatter", () => {
    const md = renderNoteAsMarkdown({
      frontmatter: { title: "x", count: 5, ready: true },
      contentMd: "body",
    });
    expect(md).toMatch(/^---\ntitle: x\ncount: 5\nready: true\n---\n\nbody$/);
  });

  it("JSON-quotes strings with YAML-significant characters", () => {
    const md = renderNoteAsMarkdown({
      frontmatter: { title: "has: colon", tag: "ok" },
      contentMd: "",
    });
    expect(md).toContain(`title: "has: colon"`);
    expect(md).toContain(`tag: ok`);
  });

  it("JSON-quotes strings that look like numbers/booleans/null", () => {
    const md = renderNoteAsMarkdown({
      frontmatter: { n: "42", b: "true", x: "null" },
      contentMd: "",
    });
    expect(md).toContain(`n: "42"`);
    expect(md).toContain(`b: "true"`);
    expect(md).toContain(`x: "null"`);
  });

  it("JSON-encodes arrays and objects on a single line", () => {
    const md = renderNoteAsMarkdown({
      frontmatter: { tags: ["a", "b"], meta: { x: 1 } },
      contentMd: "",
    });
    expect(md).toContain(`tags: ["a","b"]`);
    expect(md).toContain(`meta: {"x":1}`);
  });

  it("skips null and undefined frontmatter values", () => {
    const md = renderNoteAsMarkdown({
      frontmatter: { a: 1, b: null, c: undefined, d: 2 },
      contentMd: "",
    });
    expect(md).toContain("a: 1");
    expect(md).not.toContain("b:");
    expect(md).not.toContain("c:");
    expect(md).toContain("d: 2");
  });

  it("round-trips render → parse for common frontmatter shapes", () => {
    // null is dropped by the renderer (omitted key), so the
    // round-trip preserves everything else.
    const original = {
      title: "My Note",
      count: 42,
      ready: true,
      tags: ["a", "b"],
      meta: { x: 1, y: "z" },
      tricky: "has: colon",
    };
    const md = renderNoteAsMarkdown({
      frontmatter: original,
      contentMd: "body",
    });
    const parsed = parseMarkdownBlob(md);
    expect(parsed.contentMd).toBe("body");
    expect(parsed.frontmatter).toEqual(original);
  });
});

class FakeVaultRepository implements VaultRepository {
  constructor(
    private readonly notes: Record<number, NoteSelectByIdResult>,
    private readonly versions: Record<number, NoteVersionSelectResult>,
  ) {}
  async createVault(): Promise<{ id: number }> {
    throw new Error("unused");
  }
  async addMember(): Promise<{ id: number }> {
    throw new Error("unused");
  }
  async listVaultsForUser(): Promise<Array<{ id: number; name: string; slug: string }>> {
    return [];
  }
  async createNote(): Promise<{ id: number; versionId: number }> {
    throw new Error("unused");
  }
  async updateNote(): Promise<{ versionId: number }> {
    throw new Error("unused");
  }
  async getNoteById(noteId: number): Promise<NoteSelectByIdResult | null> {
    return this.notes[noteId] ?? null;
  }
  async getNoteVersion(): Promise<NoteVersionSelectResult | null> {
    return null;
  }
  async getLatestNoteVersion(
    noteId: number,
  ): Promise<NoteVersionSelectResult | null> {
    return this.versions[noteId] ?? null;
  }
  async listNotesInVault(): Promise<NoteSelectByIdResult[]> {
    return [];
  }
}

describe("exportNoteAsMarkdown — Phase 15", () => {
  it("returns null when the note doesn't exist", async () => {
    const repo = new FakeVaultRepository({}, {});
    const result = await exportNoteAsMarkdown(999, { repository: repo });
    expect(result).toBeNull();
  });

  it("returns null when the note exists but has no version", async () => {
    const repo = new FakeVaultRepository(
      {
        7: {
          id: 7,
          vaultId: 1,
          slug: "test",
          title: "Test Note",
          currentVersionId: null,
          governanceStatus: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      {},
    );
    const result = await exportNoteAsMarkdown(7, { repository: repo });
    expect(result).toBeNull();
  });

  it("renders the latest version with frontmatter merged from note + version", async () => {
    const repo = new FakeVaultRepository(
      {
        7: {
          id: 7,
          vaultId: 1,
          slug: "my-note",
          title: "My Note",
          currentVersionId: 100,
          governanceStatus: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      {
        7: {
          id: 100,
          noteId: 7,
          version: 3,
          contentMd: "# Body\n\nparagraph",
          contentHash: "abc",
          frontmatter: { kind: "investigation", status: "open" },
          authorUserId: 42,
          createdAt: new Date(),
        },
      },
    );
    const result = await exportNoteAsMarkdown(7, { repository: repo });
    expect(result).not.toBeNull();
    expect(result!.noteId).toBe(7);
    expect(result!.version).toBe(3);
    expect(result!.filename).toBe("my-note.md");
    expect(result!.markdown).toContain("---");
    expect(result!.markdown).toContain("title: My Note");
    expect(result!.markdown).toContain("slug: my-note");
    expect(result!.markdown).toContain("noteId: 7");
    expect(result!.markdown).toContain("version: 3");
    expect(result!.markdown).toContain("kind: investigation");
    expect(result!.markdown).toContain("status: open");
    expect(result!.markdown).toContain("# Body\n\nparagraph");
  });

  it("sanitizes the slug into a safe filename", async () => {
    const repo = new FakeVaultRepository(
      {
        7: {
          id: 7,
          vaultId: 1,
          slug: "Has Spaces & Punctuation!",
          title: "T",
          currentVersionId: 100,
          governanceStatus: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      {
        7: {
          id: 100,
          noteId: 7,
          version: 1,
          contentMd: "",
          contentHash: "",
          frontmatter: null,
          authorUserId: null,
          createdAt: new Date(),
        },
      },
    );
    const result = await exportNoteAsMarkdown(7, { repository: repo });
    expect(result!.filename).toBe("Has-Spaces-Punctuation.md");
  });
});
