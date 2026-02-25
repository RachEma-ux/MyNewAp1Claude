/**
 * Intent Router — Deterministic operator selection from user intent
 *
 * Routing rules v1 (keyword-based):
 *   "audit, scan, review" → auditor
 *   "policy, compliance, governance" → governance
 *   "deploy, release, PR, CI" → deploy
 *   "generate, build, implement, create, write" → builder
 *
 * Falls back to "builder" if no keywords match.
 */

import type { Intent, OperatorName } from "@shared/operator-types";
import { INTENT_ROUTING_RULES } from "@shared/operator-types";

export function routeIntent(intent: Intent): OperatorName {
  const text = intent.description.toLowerCase();

  // Score each rule by keyword matches
  let bestMatch: { operator: OperatorName; score: number } = { operator: "builder", score: 0 };

  for (const rule of INTENT_ROUTING_RULES) {
    let score = 0;
    for (const keyword of rule.keywords) {
      if (text.includes(keyword)) {
        score += 1;
      }
    }

    if (score > bestMatch.score) {
      bestMatch = { operator: rule.operator, score };
    }
  }

  return bestMatch.operator;
}
