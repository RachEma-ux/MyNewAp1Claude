/**
 * KGIA — Query Repair Service
 *
 * Validation-repair loop: takes a QueryPlan, runs it through governance
 * checks, and if it fails on fixable violations (missing LIMIT, excessive
 * hop depth), attempts to auto-repair up to N times.
 */

import type { QueryPlan, GraphSource, SafetyVerdict } from "../domain/types";
import { evaluateQuerySafety, DEFAULT_POLICY } from "../governance/policies";

/** Repair result */
export interface RepairResult {
  plan: QueryPlan;
  repaired: boolean;
  attempts: number;
  verdict: SafetyVerdict;
}

/**
 * Run the query through safety checks; if fixable violations found,
 * attempt auto-repair up to maxAttempts times.
 */
export function repairQuery(
  plan: QueryPlan,
  source: GraphSource,
  maxAttempts: number = 3
): RepairResult {
  let current = { ...plan };
  let attempts = 0;

  while (attempts < maxAttempts) {
    const verdict = evaluateQuerySafety(current.queryText, source);

    if (verdict.safe) {
      return { plan: current, repaired: attempts > 0, attempts, verdict };
    }

    // Attempt repairs for known fixable violations
    let queryText = current.queryText;
    let didRepair = false;

    for (const violation of verdict.violations) {
      if (violation.includes("LIMIT") || violation.includes("limit")) {
        const maxRows = source.maxRows ?? DEFAULT_POLICY.maxRowsGlobal;
        const repaired = addLimitClause(queryText, maxRows);
        if (repaired !== queryText) {
          queryText = repaired;
          didRepair = true;
        }
      }

      if (violation.includes("hop") || violation.includes("depth")) {
        const maxHops = source.maxHops ?? DEFAULT_POLICY.maxHopsGlobal;
        const repaired = capHopDepth(queryText, maxHops);
        if (repaired !== queryText) {
          queryText = repaired;
          didRepair = true;
        }
      }
    }

    if (!didRepair) {
      // Unfixable violations — return as-is
      return { plan: current, repaired: false, attempts, verdict };
    }

    current = {
      ...current,
      queryText,
      repairAttempts: (current.repairAttempts ?? 0) + 1,
    };
    attempts++;
  }

  // Max attempts reached
  const finalVerdict = evaluateQuerySafety(current.queryText, source);
  return { plan: current, repaired: attempts > 0, attempts, verdict: finalVerdict };
}

/**
 * Inject a LIMIT clause if the query doesn't already have one.
 */
export function addLimitClause(queryText: string, maxRows: number): string {
  const upper = queryText.toUpperCase();

  // Cypher: append LIMIT N
  if (upper.includes("RETURN") && !upper.includes("LIMIT")) {
    return `${queryText.trimEnd()}\nLIMIT ${maxRows}`;
  }

  // SPARQL: append LIMIT N
  if (upper.includes("SELECT") && !upper.includes("LIMIT")) {
    return `${queryText.trimEnd()}\nLIMIT ${maxRows}`;
  }

  return queryText;
}

/**
 * Cap the hop depth in Cypher variable-length paths [*..N].
 */
export function capHopDepth(queryText: string, maxHops: number): string {
  // Match patterns like [*], [*..], [*1..], [*..10], [*1..10]
  return queryText.replace(
    /\[\*(\d*)\.\.(\d*)\]/g,
    (_match, min, max) => {
      const minVal = min ? Math.min(parseInt(min, 10), maxHops) : 1;
      const maxVal = max ? Math.min(parseInt(max, 10), maxHops) : maxHops;
      return `[*${minVal}..${maxVal}]`;
    }
  ).replace(
    /\[\*\]/g,
    `[*1..${maxHops}]`
  );
}
