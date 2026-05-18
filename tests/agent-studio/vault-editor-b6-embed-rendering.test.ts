/**
 * Track B — B6 — `![[embed]]` rendering.
 *
 * Behavioral tests of the pure `splitEmbedSegments` parser +
 * structural locks on the editor mount + the depth-guard /
 * loading / not-found / rendered branches.
 *
 * Authority: ~/.claude/projects/-root/memory/project_obsidian_vault_authority.md
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import { splitEmbedSegments } from "../../client/src/modules/agent-studio/components/graph-workspace/NoteEmbedAwareMarkdown";

const COMPONENT = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/graph-workspace/NoteEmbedAwareMarkdown.tsx",
);
const PANE = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/graph-workspace/MarkdownEditorPane.tsx",
);

function read(p: string): string {
  return readFileSync(p, "utf8");
}

describe("B6 — splitEmbedSegments", () => {
  it("returns a single text segment when no embeds", () => {
    const r = splitEmbedSegments("# Hello\n\nNo embeds here.");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "text", text: "# Hello\n\nNo embeds here." });
  });

  it("splits a single `![[slug]]` into text + embed + text", () => {
    const r = splitEmbedSegments("Before\n\n![[note-1]]\n\nAfter");
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ kind: "text" });
    expect(r[1]).toMatchObject({ kind: "embed", slug: "note-1" });
    expect(r[2]).toMatchObject({ kind: "text" });
  });

  it("captures the alias from `![[slug|Alias text]]`", () => {
    const r = splitEmbedSegments("![[note-1|My Custom Label]]");
    const embed = r.find((s) => s.kind === "embed");
    expect(embed).toMatchObject({ slug: "note-1", alias: "My Custom Label" });
  });

  it("multiple embeds in one source", () => {
    const r = splitEmbedSegments("![[a]] middle ![[b]]");
    const embeds = r.filter((s) => s.kind === "embed");
    expect(embeds).toHaveLength(2);
    expect(embeds.map((e) => e.slug)).toEqual(["a", "b"]);
  });

  it("attachment-shaped embeds (`.png` etc) are NOT extracted as note embeds", () => {
    const r = splitEmbedSegments(
      "Look at ![[photo.png]] and then ![[notes-slug]]",
    );
    const embeds = r.filter((s) => s.kind === "embed");
    // Only the note-slug embed should be extracted; the image is
    // left in a text segment for AppStreamdown's image pipeline.
    expect(embeds).toHaveLength(1);
    expect(embeds[0]!.slug).toBe("notes-slug");
  });

  it("non-embed wikilinks (no leading `!`) are NOT extracted", () => {
    const r = splitEmbedSegments("See [[note-1]] for context");
    expect(r).toHaveLength(1);
    expect(r[0]!.kind).toBe("text");
  });

  it("empty string yields one empty text segment", () => {
    const r = splitEmbedSegments("");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "text", text: "" });
  });
});

describe("B6 — NoteEmbedAwareMarkdown structural lock", () => {
  const src = read(COMPONENT);

  it("imports AppStreamdown + trpc (reuses existing infra)", () => {
    expect(src).toMatch(
      /import\s+\{\s*AppStreamdown\s*\}\s+from\s+["'][^"']*\/AppStreamdown["']/,
    );
    expect(src).toMatch(/from\s+["'][^"']*\/trpc["']/);
  });

  it("declares MAX_EMBED_DEPTH = 3", () => {
    expect(src).toMatch(/MAX_EMBED_DEPTH\s*=\s*3/);
  });

  it("uses getNote tRPC for the actual embedded contentMd", () => {
    expect(src).toContain("agentStudio.vault.getNote");
  });

  it("guards on depth > MAX_EMBED_DEPTH (cycle / runaway prevention)", () => {
    expect(src).toMatch(/depth\s*>\s*MAX_EMBED_DEPTH/);
    expect(src).toContain('data-testid="note-embed-depth-capped"');
  });

  it("renders distinct loading / not-found / rendered states", () => {
    expect(src).toContain('data-testid="note-embed-loading"');
    expect(src).toContain('data-testid="note-embed-not-found"');
    expect(src).toContain('data-testid="note-embed-rendered"');
  });

  it("attachment-shaped embeds are skipped in the segmenter", () => {
    expect(src).toContain("looksLikeAttachment");
    // Strip the leading `!` rule via the regex + the early `continue`.
    expect(src).toMatch(/if \(looksLikeAttachment\(target\)\) continue/);
  });

  it("recursive expansion threads depth+1 into the nested NoteEmbedAwareMarkdown", () => {
    expect(src).toMatch(/<NoteEmbedAwareMarkdown[\s\S]*?_depth=\{depth\}/);
  });
});

describe("B6 — MarkdownEditorPane mount", () => {
  const src = read(PANE);

  it("imports NoteEmbedAwareMarkdown", () => {
    expect(src).toMatch(
      /import\s+NoteEmbedAwareMarkdown\s+from\s+["']\.\/NoteEmbedAwareMarkdown["']/,
    );
  });

  it("renders NoteEmbedAwareMarkdown in read mode (replaces direct AppStreamdown)", () => {
    expect(src).toMatch(/mode\s*===\s*["']read["']\s*&&\s*<NoteEmbedAwareMarkdown\s+source=\{liveText\}/);
  });
});
