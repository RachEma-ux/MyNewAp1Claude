/**
 * Env-flag-gated default installer for the 18-γ static lane hooks.
 *
 * T-B.4 closure. Phase 18-γ shipped the three concrete static-data
 * hook factories (`makeStaticFactRetrieveHook` / `makeStaticChunkAssembleHook`
 * / `makeStaticBlockComposeHook`) via PRs #1179 / #1180 / #1181 but
 * never wired them at boot. This installer mirrors the observability
 * installer pattern (#PR-V1-82) so an operator can opt-in to the
 * default static-data hook registration.
 *
 *   AGS_EXTENSIONS_LANE_HOOKS_STATIC=on
 *     → installs static-data lane hooks for retrieve / assemble /
 *       compose lanes using the operator-supplied data table.
 *
 *   Anything else / unset → no-op.
 *
 * Default OFF. The data tables are caller-supplied; default install
 * registers EMPTY hooks (the hook factories handle empty tables
 * gracefully by short-circuiting with `succeeded: true`).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No tool-lane registration.
 *   - No `credential-resolver` / `*_API_KEY` /
 *     `dispatchMcpToolCall` / `neo4j-driver` / `openrouter` /
 *     `GraphRepository` imports.
 *   - The installer composes existing `registerLaneHook` from
 *     `./lane-hooks.js` — no new registration primitive.
 */

import { registerLaneHook } from "./lane-hooks.js";
import {
  makeStaticFactRetrieveHook,
  type StaticFactEntry,
} from "./static-fact-retrieve-hook.js";
import { makeStaticChunkAssembleHook } from "./static-chunk-assemble-hook.js";
import { makeStaticBlockComposeHook } from "./static-block-compose-hook.js";
import type { ContractedRetrievalChunk } from "./lane-hook-contracts.js";

const ENV_KEY = "AGS_EXTENSIONS_LANE_HOOKS_STATIC";

export type InstalledStaticLane = "retrieve" | "assemble" | "compose";

export interface MaybeInstallDefaultStaticLaneHooksOptions {
  /** Override the env source. Tests inject `{}`. */
  readonly env?: Record<string, string | undefined>;
  /**
   * Optional static-fact data table. Defaults to `[]` — the empty
   * hook short-circuits with `succeeded: true` on every call, which
   * preserves the "no contribution" baseline.
   */
  readonly retrieveFacts?: ReadonlyArray<StaticFactEntry>;
  /**
   * Optional pre-built assemble chunks. Defaults to `[]`.
   */
  readonly assembleChunks?: ReadonlyArray<ContractedRetrievalChunk>;
  /**
   * Optional compose-time static blocks (e.g., footer disclaimers,
   * citation rewriters). Defaults to `[]`. The compose lane accepts
   * opaque records — shape is operator-defined and consumed by the
   * downstream composer.
   */
  readonly composeBlocks?: ReadonlyArray<Record<string, unknown>>;
  /** Test seam — override the register call so tests can capture
   *  the registration calls without touching the real registry. */
  readonly register?: typeof registerLaneHook;
}

export interface MaybeInstallDefaultStaticLaneHooksResult {
  readonly installed: boolean;
  readonly installedLanes: ReadonlyArray<InstalledStaticLane>;
}

export function maybeInstallDefaultStaticLaneHooks(
  options: MaybeInstallDefaultStaticLaneHooksOptions = {},
): MaybeInstallDefaultStaticLaneHooksResult {
  const env = options.env ?? process.env;
  if (env[ENV_KEY] !== "on") {
    return { installed: false, installedLanes: [] };
  }
  const register = options.register ?? registerLaneHook;
  const installedLanes: InstalledStaticLane[] = [];

  register(
    "retrieve",
    makeStaticFactRetrieveHook({ facts: options.retrieveFacts ?? [] }),
  );
  installedLanes.push("retrieve");

  register(
    "assemble",
    makeStaticChunkAssembleHook({ chunks: options.assembleChunks ?? [] }),
  );
  installedLanes.push("assemble");

  register(
    "compose",
    makeStaticBlockComposeHook({ blocks: options.composeBlocks ?? [] }),
  );
  installedLanes.push("compose");

  return { installed: true, installedLanes };
}
