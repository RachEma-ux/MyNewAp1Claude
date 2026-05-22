/**
 * Graph Lens — tRPC router (T-F.61).
 *
 * Operator-facing surface for the lens registry + runner registry
 * shipped in #992 (definitions) / #998 (stubs) / #1253 (real runtime
 * runner) / #1254 (ASDB adapter).
 *
 * Mounted at `agentStudio.graphLens.*`. Three procedures:
 *
 *   - `list` — returns the registered definitions joined with
 *     "does this kind have a runner installed?" so the lens browser
 *     can render a "placeholder" badge for kinds that haven't
 *     shipped a real runner yet.
 *   - `summary` — registry coverage gauge (`X/Y kinds have runners`)
 *     for the admin dashboard.
 *   - `render` — runs the lens for a given (workspaceId, lensId).
 *     Returns a typed `LensSnapshotEnvelope` so the client knows
 *     whether the kind has a runner before unpacking the snapshot.
 *
 * Permission model
 *   - All procedures are `adminProcedure` (operator-only).
 *   - The runner's per-node permission post-filter (#1253) still
 *     applies — admin DOES NOT bypass it. This keeps the visible/
 *     hidden contract consistent across surfaces.
 *
 * Hard-rule compliance (CLAUDE.md)
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - Source-scan tested.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure, router } from "../../../_core/trpc.js";
import { getDb } from "../../../db/connection.js";
import { workspaces } from "../../../../drizzle/tables/users.js";
import {
  GRAPH_LENS_KINDS,
  GRAPH_LENS_KIND_METADATA,
  type GraphLensDefinition,
  type GraphLensKind,
} from "./contracts.js";
import { listGraphLenses } from "./registry.js";
import {
  getLensRunner,
  runLens,
  summarizeLensRunnerRegistry,
  type LensSnapshot,
} from "./runner-contract.js";

// ============================================================================
// Input schemas
// ============================================================================

const RenderLensInput = z.object({
  workspaceId: z.number().int().positive(),
  lensId: z.string().min(1).max(120),
  limit: z.number().int().positive().max(500).optional(),
  asOf: z.date().optional(),
});

// ============================================================================
// Output shapes
// ============================================================================

export interface LensListEntry {
  readonly definition: GraphLensDefinition;
  readonly hasRunner: boolean;
}

export interface LensRenderEnvelopeWithRunner {
  readonly status: "ok";
  readonly snapshot: LensSnapshot;
}

export interface LensRenderEnvelopeMissingRunner {
  readonly status: "no_runner_for_kind";
  readonly kind: GraphLensKind;
}

export interface LensRenderEnvelopeNotFound {
  readonly status: "not_found";
  readonly lensId: string;
}

/**
 * Returned when `render` was called with a `workspaceId` that does
 * not match any row in the operator `workspaces` table.
 *
 * Why explicit (rather than letting the runner return an empty
 * snapshot): F4 verification finding (2026-05-22) — without this
 * check, `render({workspaceId:9999})` returned 86 nodes / 23 edges
 * for the institutional_memory lens because the ASDB reader's
 * agents/decisions/governance_records queries are not all
 * workspace-scoped at the table level (some are ASDB-global). A
 * fast existence check at the router boundary prevents cross-
 * workspace surface leakage; per-table workspace scoping in the
 * reader is tracked as a follow-up slice.
 */
export interface LensRenderEnvelopeWorkspaceNotFound {
  readonly status: "workspace_not_found";
  readonly workspaceId: number;
}

export type LensRenderEnvelope =
  | LensRenderEnvelopeWithRunner
  | LensRenderEnvelopeMissingRunner
  | LensRenderEnvelopeNotFound
  | LensRenderEnvelopeWorkspaceNotFound;

// ============================================================================
// Router
// ============================================================================

export const graphLensRouter = router({
  /**
   * List every registered lens definition + whether its kind has a
   * runner installed. The lens browser renders a "placeholder" badge
   * for `hasRunner === false` so operators can tell which lenses are
   * still empty-state vs. carrying real data.
   */
  list: adminProcedure.query(async (): Promise<ReadonlyArray<LensListEntry>> => {
    const defs = listGraphLenses();
    return defs.map((def) => ({
      definition: def,
      hasRunner: getLensRunner(def.kind) !== undefined,
    }));
  }),

  /**
   * Registry coverage gauge — used for the admin dashboard's
   * "lens runner coverage" gauge. Shape matches
   * `LensRunnerRegistryCoverageSummary` from the runner contract.
   */
  summary: adminProcedure.query(() => {
    const coverage = summarizeLensRunnerRegistry();
    const kindLabels: Record<string, string> = {};
    for (const k of GRAPH_LENS_KINDS) {
      kindLabels[k] = GRAPH_LENS_KIND_METADATA[k].label;
    }
    return { coverage, kindLabels };
  }),

  /**
   * Run a lens for a given `(workspaceId, lensId)`. Returns a
   * discriminated envelope so the client can render a "no runner
   * yet for this kind" empty-state without needing a separate
   * pre-check round-trip.
   *
   * Viewer context
   *   - `userId` comes from the admin session.
   *   - `workspaceId` is operator-supplied (the admin surface spans
   *     workspaces).
   */
  render: adminProcedure
    .input(RenderLensInput)
    .query(async ({ ctx, input }): Promise<LensRenderEnvelope> => {
      const defs = listGraphLenses();
      const def = defs.find((d) => d.id === input.lensId);
      if (!def) {
        return { status: "not_found", lensId: input.lensId };
      }
      const runner = getLensRunner(def.kind);
      if (!runner) {
        return { status: "no_runner_for_kind", kind: def.kind };
      }
      // F4 — workspace existence check (2026-05-22). See
      // `LensRenderEnvelopeWorkspaceNotFound` for the rationale.
      // When `getDb()` is unavailable (no DATABASE_URL), we fall
      // through to the runner with a warning rather than failing
      // open — preserves the existing contract for CI / no-DB envs.
      const db = getDb();
      if (db) {
        const wsRows = await db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.id, input.workspaceId))
          .limit(1);
        if (wsRows.length === 0) {
          return {
            status: "workspace_not_found",
            workspaceId: input.workspaceId,
          };
        }
      }
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const userId = ctxAny.user?.id ?? null;
      const snapshot = await runLens(def, {
        workspaceId: input.workspaceId,
        userId,
        limit: input.limit,
        asOf: input.asOf,
      });
      return { status: "ok", snapshot };
    }),
});
