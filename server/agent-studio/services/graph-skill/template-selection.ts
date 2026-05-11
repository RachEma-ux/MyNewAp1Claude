/**
 * Phase 12.5 §1 — Graph Skill Pack → template selection.
 *
 * Pure helper that bridges the eligibility evaluator (which picks an
 * eligible pack for a query intent) and the GraphRetrievalRouter
 * (which consumes a single `templateKey`). The router currently
 * accepts `templateKey` as input verbatim; this helper lets a
 * caller resolve "which template from which pack" without re-implementing
 * the precedence rules at each call site.
 *
 * Strategy:
 *   1. Walk packs in the order `evaluateEligibility` returned them
 *      (lower-risk + more-specific first per the ADR §1.3 ranking).
 *   2. For each pack, look up its ordered template-key list from the
 *      provided mapping (caller fetches this from
 *      `ags_graph_skill_query_templates` joined with
 *      `ags_query_templates.template_key`).
 *   3. When `preferTemplateKeys` is set, prefer matching keys within
 *      the pack's allowed list; otherwise pick the first.
 *   4. Returns `null` if no pack has any templates registered or none
 *      of the prefer-keys match.
 *
 * The function is intentionally non-throwing — operator misconfigurations
 * (a pack with no templates) degrade gracefully to "no template
 * selected" so the router can either short-circuit or fall through to
 * a default behavior, matching the existing graceful-degradation
 * pattern in the rest of the GraphRAG retrieval surface.
 *
 * ADR: docs/architecture/agent-studio-graph-skill-packs.md §1.3,
 *      docs/architecture/agent-studio-graphrag-retrieval-router.md §1.2
 */

import type { EligibilityResult, SkillPackSummary } from "./eligibility.js";

/**
 * Per-pack allowed template keys, ordered per
 * `ags_graph_skill_query_templates.ordering`. Caller is responsible
 * for assembling this from the join with `ags_query_templates`.
 */
export type PackTemplateMap = ReadonlyMap<string, ReadonlyArray<string>>;

export interface SelectTemplateInput {
  readonly eligibility: EligibilityResult;
  readonly packTemplates: PackTemplateMap;
  /**
   * Optional caller-supplied preference list (e.g. derived from query
   * intent). If any pack's allowed list contains one of these keys, it
   * wins over the pack's natural ordering. Order within
   * `preferTemplateKeys` matters: earlier keys are preferred.
   */
  readonly preferTemplateKeys?: ReadonlyArray<string>;
}

export interface SelectTemplateResult {
  readonly templateKey: string;
  readonly pack: SkillPackSummary;
  readonly reason:
    | "first_template_in_top_pack"
    | "preferred_key_matched";
}

export function selectTemplateForEligiblePacks(
  input: SelectTemplateInput,
): SelectTemplateResult | null {
  const prefer = input.preferTemplateKeys ?? [];

  // First pass — honor caller preferences across all eligible packs.
  if (prefer.length > 0) {
    for (const preferred of prefer) {
      for (const pack of input.eligibility.eligible) {
        const templates = input.packTemplates.get(pack.skillKey);
        if (templates && templates.includes(preferred)) {
          return {
            templateKey: preferred,
            pack,
            reason: "preferred_key_matched",
          };
        }
      }
    }
  }

  // Second pass — fall back to the first template in the highest-ranked
  // pack that has any templates registered.
  for (const pack of input.eligibility.eligible) {
    const templates = input.packTemplates.get(pack.skillKey);
    if (templates && templates.length > 0) {
      return {
        templateKey: templates[0],
        pack,
        reason: "first_template_in_top_pack",
      };
    }
  }

  return null;
}
