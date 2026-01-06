/**
 * Agent Diff Router
 * 
 * Structured and side-by-side diff for agent comparison
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { agents } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { AgentDiffMode } from "../../features/agents-create/types/agent-schema";

export const agentsDiffRouter = router({
  /**
   * POST /agents/diff - Generate diff between two agent versions
   */
  generate: protectedProcedure
    .input(
      z.object({
        baseId: z.string(),
        compareId: z.string(),
        mode: AgentDiffMode.default("structured"),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Load both agents
      const [base, compare] = await Promise.all([
        (db.query as any).agents.findFirst({ where: // @ts-expect-error - Drizzle type inference issue
 eq(agents.id, input.baseId) }),
        (db.query as any).agents.findFirst({ where: // @ts-expect-error - Drizzle type inference issue
 eq(agents.id, input.compareId) }),
      ]);

      if (!base || !compare) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "One or both agents not found",
        });
      }

      // Compute diff
      const diff = computeDiff(base, compare, input.mode);

      // Compute diff hash for audit trail
      const diffHash = `diff_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      return {
        diffHash,
        mode: input.mode,
        base: {
          id: base.id,
          name: base.name,
          version: base.lifecycleVersion,
        },
        compare: {
          id: compare.id,
          name: compare.name,
          version: compare.lifecycleVersion,
        },
        diff,
        generatedAt: new Date().toISOString(),
      };
    }),
});

// ============================================================================
// DIFF COMPUTATION
// ============================================================================

interface DiffChange {
  path: string;
  type: "added" | "removed" | "modified";
  baseValue: any;
  compareValue: any;
  locked?: boolean;
  policyNote?: string;
}

function computeDiff(
  base: any,
  compare: any,
  mode: "structured" | "side-by-side"
): DiffChange[] | { base: string; compare: string } {
  if (mode === "side-by-side") {
    return {
      base: JSON.stringify(base, null, 2),
      compare: JSON.stringify(compare, null, 2),
    };
  }

  // Structured diff
  const changes: DiffChange[] = [];

  // Compare identity
  if (base.name !== compare.name) {
    changes.push({
      path: "identity.name",
      type: "modified",
      baseValue: base.name,
      compareValue: compare.name,
    });
  }

  if (base.description !== compare.description) {
    changes.push({
      path: "identity.description",
      type: "modified",
      baseValue: base.description,
      compareValue: compare.description,
    });
  }

  // Compare anatomy
  const baseAnatomy = base.anatomy || {};
  const compareAnatomy = compare.anatomy || {};

  if (baseAnatomy.systemPrompt !== compareAnatomy.systemPrompt) {
    changes.push({
      path: "anatomy.systemPrompt",
      type: "modified",
      baseValue: baseAnatomy.systemPrompt,
      compareValue: compareAnatomy.systemPrompt,
    });
  }

  // Compare capabilities
  const baseCaps = baseAnatomy.capabilities || {};
  const compareCaps = compareAnatomy.capabilities || {};

  if (JSON.stringify(baseCaps.tools) !== JSON.stringify(compareCaps.tools)) {
    changes.push({
      path: "anatomy.capabilities.tools",
      type: "modified",
      baseValue: baseCaps.tools,
      compareValue: compareCaps.tools,
    });
  }

  if (baseCaps.allowExternalWrite !== compareCaps.allowExternalWrite) {
    changes.push({
      path: "anatomy.capabilities.allowExternalWrite",
      type: "modified",
      baseValue: baseCaps.allowExternalWrite,
      compareValue: compareCaps.allowExternalWrite,
      locked: compareCaps.allowExternalWrite === true, // Lock if trying to enable
      policyNote: "External write access requires policy exception",
    });
  }

  // Compare limits
  const baseLimits = base.limits || {};
  const compareLimits = compare.limits || {};

  if (baseLimits.maxCostPerDay !== compareLimits.maxCostPerDay) {
    changes.push({
      path: "limits.maxCostPerDay",
      type: "modified",
      baseValue: baseLimits.maxCostPerDay,
      compareValue: compareLimits.maxCostPerDay,
    });
  }

  return changes;
}
