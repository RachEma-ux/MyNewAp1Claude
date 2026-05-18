/**
 * wikilink-autocomplete — Track B — B3.
 *
 * CodeMirror 6 autocomplete extension that fires on `[[` and offers
 * fuzzy-matched note slugs/titles from the caller-supplied
 * suggestion list. Inserts `[[slug]]` on accept (matches the
 * existing `extractLinksFromMarkdown` wikilink contract — see
 * `server/agent-studio/services/vault/links.ts`).
 *
 * Design:
 *  - The caller supplies a `getSuggestions` function (sync, since
 *    the editor wraps a tRPC-fed array). Returning a Promise is
 *    supported too (CompletionSource can be async) — handy for
 *    the case where we lazy-load notes per-vault.
 *  - The trigger token is `[[` followed by any non-`]` chars; we
 *    match against this prefix, return notes whose slug OR title
 *    contains the prefix (case-insensitive), capped at 20.
 *  - On accept the editor inserts `[[slug]]` and places the cursor
 *    AFTER the closing `]]`.
 *
 * Lookup performance is a problem for vaults with thousands of
 * notes — for the MVP we accept O(n) filter over the in-memory
 * array. A future slice can route through a tRPC `searchVaultNotes`
 * with server-side filtering.
 *
 * ADR: Track B — Obsidian-style editor parity per
 *      ~/.claude/projects/-root/memory/project_obsidian_vault_authority.md
 */

import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";

export interface WikilinkSuggestion {
  readonly slug: string;
  readonly title: string | null;
}

export interface WikilinkAutocompleteOptions {
  /**
   * Caller-supplied suggestion list (sync or async). Editor calls
   * this on every keystroke after `[[` — keep it cheap (use a
   * memoized tRPC cache).
   */
  readonly getSuggestions: (
    prefix: string,
  ) => readonly WikilinkSuggestion[] | Promise<readonly WikilinkSuggestion[]>;
  /** Optional cap on rendered suggestions. Default 20. */
  readonly maxSuggestions?: number;
}

/** Maximum prefix length we'll accept before bailing out. */
const MAX_PREFIX_LEN = 100;

/**
 * Build a CompletionSource that fires when the cursor sits inside a
 * `[[...]` (or `[[..` without a closer yet) token.
 */
export function buildWikilinkCompletionSource(
  options: WikilinkAutocompleteOptions,
): CompletionSource {
  const max = options.maxSuggestions ?? 20;
  return async function wikilinkSource(
    ctx: CompletionContext,
  ): Promise<CompletionResult | null> {
    // Match `[[` followed by any non-`]` chars up to the cursor.
    const m = ctx.matchBefore(/\[\[[^\]]*/);
    if (!m) return null;
    const after = m.text.slice(2); // strip leading `[[`
    if (after.length > MAX_PREFIX_LEN) return null;
    const lowerPrefix = after.toLowerCase();
    const allRaw = await Promise.resolve(options.getSuggestions(after));
    const all = Array.isArray(allRaw) ? allRaw : [...allRaw];
    const matches = all
      .filter((s) => {
        if (lowerPrefix === "") return true;
        if (s.slug.toLowerCase().includes(lowerPrefix)) return true;
        const t = s.title?.toLowerCase() ?? "";
        return t.includes(lowerPrefix);
      })
      .slice(0, max);
    if (matches.length === 0) return null;
    return {
      from: m.from + 2, // start right after the `[[`
      // Filter on the editor side too — CM6 narrows as the operator
      // keeps typing.
      validFor: /^[^\]]*$/,
      options: matches.map((s) => ({
        label: s.title ?? s.slug,
        detail: s.title ? s.slug : undefined,
        type: "text" as const,
        apply: `${s.slug}]]`,
      })),
    };
  };
}

/**
 * Returns the CodeMirror Extension that mounts the wikilink
 * completion source via `autocompletion()`. The caller composes
 * this into the editor's extension list.
 */
export function wikilinkAutocomplete(
  options: WikilinkAutocompleteOptions,
): Extension {
  return autocompletion({
    override: [buildWikilinkCompletionSource(options)],
    // Open immediately on `[`-typed (so the popup appears as soon
    // as the operator types the second `[`). The completion source
    // returns null if the token isn't actually `[[…`, so this is
    // safe to set aggressively.
    activateOnTyping: true,
    closeOnBlur: true,
  });
}
