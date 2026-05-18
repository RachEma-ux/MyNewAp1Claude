/**
 * Track B — B4 — `#tag` autocomplete.
 *
 * Behavioral test of the completion source + structural lock on
 * the editor wiring and the new `listTagsForVault` tRPC procedure.
 *
 * Authority: ~/.claude/projects/-root/memory/project_obsidian_vault_authority.md
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import { buildTagCompletionSource } from "../../client/src/modules/agent-studio/components/graph-workspace/tag-autocomplete";

const SOURCE = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/graph-workspace/tag-autocomplete.ts",
);
const PANE = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/graph-workspace/MarkdownEditorPane.tsx",
);
const ROUTER = resolve(
  __dirname,
  "../../server/agent-studio/services/vault/router.ts",
);

function read(p: string): string {
  return readFileSync(p, "utf8");
}

/**
 * Synthetic CompletionContext shim — covers `matchBefore` +
 * `state.doc.sliceString` (needed for the preceding-whitespace
 * guard).
 */
function makeContext(textBeforeCursor: string): {
  matchBefore: (rx: RegExp) => { from: number; to: number; text: string } | null;
  state: { doc: { sliceString: (from: number, to: number) => string } };
} {
  return {
    matchBefore(rx: RegExp) {
      const m = rx.exec(textBeforeCursor);
      if (!m) return null;
      const lastIdx = textBeforeCursor.lastIndexOf(m[0]);
      return {
        from: lastIdx,
        to: lastIdx + m[0].length,
        text: m[0],
      };
    },
    state: {
      doc: {
        sliceString(from: number, to: number) {
          return textBeforeCursor.slice(from, to);
        },
      },
    },
  };
}

const SAMPLE_TAGS = [
  { tag: "ai", count: 12 },
  { tag: "research", count: 8 },
  { tag: "obsidian", count: 5 },
  { tag: "rag", count: 3 },
  { tag: "agent-studio", count: 2 },
];

describe("B4 — buildTagCompletionSource", () => {
  const source = buildTagCompletionSource({
    getSuggestions: () => SAMPLE_TAGS,
  });

  it("returns null when there's no `#` token before the cursor", async () => {
    const r = await source(makeContext("plain text") as never);
    expect(r).toBeNull();
  });

  it("offers ALL tags when prefix is empty (`#` just typed at start)", async () => {
    const r = await source(makeContext("#") as never);
    expect(r).not.toBeNull();
    expect(r!.options).toHaveLength(SAMPLE_TAGS.length);
  });

  it("filters by case-insensitive substring", async () => {
    const r = await source(makeContext("see #res") as never);
    expect(r).not.toBeNull();
    const labels = r!.options.map((o) => (o as { label: string }).label);
    expect(labels).toContain("research");
    expect(labels).not.toContain("ai");
  });

  it("does NOT trigger in the middle of a word (`foo#bar`)", async () => {
    const r = await source(makeContext("foo#bar") as never);
    expect(r).toBeNull();
  });

  it("triggers after whitespace OR at start of doc", async () => {
    const r1 = await source(makeContext("#ai") as never);
    expect(r1).not.toBeNull();
    const r2 = await source(makeContext("hello #ai") as never);
    expect(r2).not.toBeNull();
  });

  it("`apply` inserts `tag` with trailing space", async () => {
    const r = await source(makeContext("#res") as never);
    const first = r!.options[0] as { apply: string };
    expect(first.apply).toBe("research ");
  });

  it("from-position skips the `#` (matches CM6 semantics)", async () => {
    const r = await source(makeContext("see #ai") as never);
    expect(r).not.toBeNull();
    // text "see #ai" — `#` is at index 4, prefix starts at 5.
    expect(r!.from).toBe(5);
  });

  it("`detail` shows usage count when > 1", async () => {
    const r = await source(makeContext("#ai") as never);
    const first = r!.options[0] as { detail?: string };
    expect(first.detail).toBe("12 uses");
  });

  it("respects maxSuggestions cap", async () => {
    const capped = buildTagCompletionSource({
      getSuggestions: () => SAMPLE_TAGS,
      maxSuggestions: 2,
    });
    const r = await capped(makeContext("#") as never);
    expect(r!.options).toHaveLength(2);
  });

  it("supports async getSuggestions (Promise return)", async () => {
    const asyncSource = buildTagCompletionSource({
      getSuggestions: () => Promise.resolve(SAMPLE_TAGS),
    });
    const r = await asyncSource(makeContext("#rag") as never);
    expect(r).not.toBeNull();
    expect((r!.options[0] as { label: string }).label).toBe("rag");
  });
});

describe("B4 — listTagsForVault tRPC + editor wiring", () => {
  it("router declares listTagsForVault as a vault.* query", () => {
    const src = read(ROUTER);
    expect(src).toMatch(/listTagsForVault:\s*protectedProcedure/);
    expect(src).toContain("extractLinksFromMarkdown");
    // Sort: count desc, alpha asc.
    expect(src).toMatch(/b\[1\]\s*-\s*a\[1\]\s*\|\|\s*a\[0\]\.localeCompare\(b\[0\]\)/);
  });

  it("MarkdownEditorPane consumes listTagsForVault + composes tag source", () => {
    const src = read(PANE);
    expect(src).toContain("agentStudio.vault.listTagsForVault");
    expect(src).toMatch(
      /import\s+\{\s*buildTagCompletionSource\s*\}\s+from\s+["']\.\/tag-autocomplete["']/,
    );
    // Both sources are wrapped in ONE autocompletion() call (CM6
    // limit). Lock the composition.
    expect(src).toMatch(/autocompletion\(\{[\s\S]*?override:\s*\[/);
    expect(src).toContain("buildWikilinkCompletionSource");
    expect(src).toContain("buildTagCompletionSource");
  });
});
