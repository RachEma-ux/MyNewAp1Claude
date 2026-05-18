/**
 * tag-autocomplete — Track B — B4.
 *
 * CodeMirror 6 autocomplete extension that fires on `#` (at the
 * start of a word) and offers fuzzy-matched tag slugs from the
 * caller-supplied list.
 *
 * Trigger rule: matches `(start | whitespace) #word…` to mirror
 * the server-side TAG_RE in `server/agent-studio/services/vault/
 * links.ts` (single source of truth for tag shape).
 *
 * Insertion: replaces the `#word` token with `#slug ` (trailing
 * space lands the cursor right after the tag so the operator can
 * keep typing without manual cursor movement).
 *
 * ADR / authority:
 *   ~/.claude/projects/-root/memory/project_obsidian_vault_authority.md
 */

import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";

export interface TagSuggestion {
  readonly tag: string;
  readonly count: number;
}

export interface TagAutocompleteOptions {
  /**
   * Caller-supplied tag list (sync or async). Editor calls this on
   * every keystroke after `#` — keep it cheap (use a memoized
   * tRPC cache).
   */
  readonly getSuggestions: (
    prefix: string,
  ) => readonly TagSuggestion[] | Promise<readonly TagSuggestion[]>;
  /** Optional cap on rendered suggestions. Default 20. */
  readonly maxSuggestions?: number;
}

/**
 * Build a CompletionSource that fires when the cursor sits inside
 * a `#word` token. Mirrors the server-side TAG_RE
 * (`(?:^|\s)#([A-Za-z][A-Za-z0-9_/-]{0,99})`).
 */
export function buildTagCompletionSource(
  options: TagAutocompleteOptions,
): CompletionSource {
  const max = options.maxSuggestions ?? 20;
  return async function tagSource(
    ctx: CompletionContext,
  ): Promise<CompletionResult | null> {
    // Match `#word` where the `#` is at start-of-doc or after
    // whitespace. The match-before pattern can't enforce the
    // preceding-whitespace constraint directly; we check it after.
    const m = ctx.matchBefore(/#[A-Za-z0-9_/-]*/);
    if (!m) return null;
    // Preceding-whitespace check: char before `#` (if any) must be
    // whitespace, otherwise this is in the middle of a word
    // (e.g. `foo#bar` shouldn't trigger).
    if (m.from > 0) {
      const charBefore = ctx.state.doc.sliceString(m.from - 1, m.from);
      if (!/\s/.test(charBefore)) return null;
    }
    const after = m.text.slice(1); // strip leading `#`
    const lowerPrefix = after.toLowerCase();
    const allRaw = await Promise.resolve(options.getSuggestions(after));
    const all = Array.isArray(allRaw) ? allRaw : [...allRaw];
    const matches = all
      .filter((s) => {
        if (lowerPrefix === "") return true;
        return s.tag.toLowerCase().includes(lowerPrefix);
      })
      .slice(0, max);
    if (matches.length === 0) return null;
    return {
      from: m.from + 1, // start right after the `#`
      // Narrow as the operator keeps typing alphanumerics / slashes.
      validFor: /^[A-Za-z0-9_/-]*$/,
      options: matches.map((s) => ({
        label: s.tag,
        detail: s.count > 1 ? `${s.count} uses` : undefined,
        type: "keyword" as const,
        // Trailing space — Obsidian's behavior.
        apply: `${s.tag} `,
      })),
    };
  };
}

/**
 * Returns the CodeMirror Extension that mounts the tag completion
 * source via `autocompletion()`. Composes side-by-side with the
 * wikilink source (both use `override` so they don't merge with
 * other sources; CM6 picks the active one by which pattern matches).
 */
export function tagAutocomplete(
  options: TagAutocompleteOptions,
): Extension {
  return autocompletion({
    override: [buildTagCompletionSource(options)],
    activateOnTyping: true,
    closeOnBlur: true,
  });
}
