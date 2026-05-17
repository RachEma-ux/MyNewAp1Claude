/**
 * Boot-time composer for ALL real lens runners (T-F.70).
 *
 * Single-call helper that walks every kind in `GRAPH_LENS_KINDS`
 * and invokes the per-kind ASDB composer. Each underlying composer
 * still honors its own envflag, so an operator can enable any
 * subset by toggling individual `AGS_GRAPH_LENS_<KIND>_RUNNER_INSTALL`
 * flags. This file just lets the production boot step write ONE
 * line instead of N.
 *
 * After T-F.69 reached 8/8 coverage + T-G.2.5 added the
 * `code_intelligence` kind (taking us to 9 lens kinds total),
 * this composer is the natural "production wires up the full lens
 * stack" closure step. Tests verify (a) every kind is reachable,
 * (b) coverage summary returns 100% when every flag is on, and
 * (c) any subset of flags installs exactly that subset.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - No `process.env.*_API_KEY` reads.
 *   - Source-scan tested.
 */

import { GRAPH_LENS_KINDS, type GraphLensKind } from "./contracts.js";
import {
  maybeInstallRuntimeLensRunnerWithAsdb,
  type MaybeInstallRuntimeLensRunnerWithAsdbOptions,
} from "./install-runtime-lens-runner-with-asdb.js";
import {
  maybeInstallGovernanceLensRunnerWithAsdb,
  type MaybeInstallGovernanceLensRunnerWithAsdbOptions,
} from "./install-governance-lens-runner.js";
import {
  maybeInstallMcpLensRunnerWithAsdb,
  type MaybeInstallMcpLensRunnerWithAsdbOptions,
} from "./install-mcp-lens-runner.js";
import {
  maybeInstallCagLensRunnerWithAsdb,
  type MaybeInstallCagLensRunnerWithAsdbOptions,
} from "./install-cag-lens-runner.js";
import {
  maybeInstallRagLensRunnerWithAsdb,
  type MaybeInstallRagLensRunnerWithAsdbOptions,
} from "./install-rag-lens-runner.js";
import {
  maybeInstallRacLensRunnerWithAsdb,
  type MaybeInstallRacLensRunnerWithAsdbOptions,
} from "./install-rac-lens-runner.js";
import {
  maybeInstallGraphSkillLensRunnerWithAsdb,
  type MaybeInstallGraphSkillLensRunnerWithAsdbOptions,
} from "./install-graph-skill-lens-runner.js";
import {
  maybeInstallInstitutionalMemoryLensRunnerWithAsdb,
  type MaybeInstallInstitutionalMemoryLensRunnerWithAsdbOptions,
} from "./install-institutional-memory-lens-runner.js";
import {
  maybeInstallCodeIntelligenceLensRunnerWithAsdb,
  type MaybeInstallCodeIntelligenceLensRunnerWithAsdbOptions,
} from "./install-code-intelligence-lens-runner.js";
import {
  maybeInstallSecurityDevSecOpsLensRunnerWithAsdb,
  type MaybeInstallSecurityDevSecOpsLensRunnerWithAsdbOptions,
} from "./install-security-devsecops-lens-runner.js";

export interface MaybeInstallAllLensRunnersWithAsdbOptions {
  /** Test seam — override env source. Each per-kind composer reads
   *  its own `AGS_GRAPH_LENS_<KIND>_RUNNER_INSTALL` flag from this. */
  readonly env?: Record<string, string | undefined>;
  /** Optional clock seam (defaults to `new Date()`). Forwarded to
   *  every per-kind composer that accepts a `now` seam. */
  readonly now?: () => Date;
}

export interface MaybeInstallAllLensRunnersWithAsdbResult {
  /** Per-kind install result — `true` iff the kind's runner was
   *  registered (its envflag was "on"). */
  readonly perKind: Readonly<Record<GraphLensKind, boolean>>;
  /** Count of kinds that installed (0 to GRAPH_LENS_KINDS.length). */
  readonly installedCount: number;
  /** Convenience — `installedCount === GRAPH_LENS_KINDS.length`. */
  readonly fullyInstalled: boolean;
}

/**
 * Single-call boot composer. Walks every closed kind and invokes
 * its per-kind ASDB composer. Returns a stable-shape result so the
 * boot logger can render "lens runners: 7 / 8 installed (missing:
 * institutional_memory)" without further branching.
 *
 * Idempotency: each per-kind composer's underlying installer throws
 * on re-registration. Production callers call this exactly once.
 * Tests use `__resetLensRunnerRegistryForTests` before each case.
 */
export function maybeInstallAllLensRunnersWithAsdb(
  options: MaybeInstallAllLensRunnersWithAsdbOptions = {},
): MaybeInstallAllLensRunnersWithAsdbResult {
  const env = options.env ?? process.env;
  const now = options.now;

  const runtimeOpts: MaybeInstallRuntimeLensRunnerWithAsdbOptions = { env, now };
  const governanceOpts: MaybeInstallGovernanceLensRunnerWithAsdbOptions = { env, now };
  const mcpOpts: MaybeInstallMcpLensRunnerWithAsdbOptions = { env, now };
  const cagOpts: MaybeInstallCagLensRunnerWithAsdbOptions = { env, now };
  const ragOpts: MaybeInstallRagLensRunnerWithAsdbOptions = { env, now };
  const racOpts: MaybeInstallRacLensRunnerWithAsdbOptions = { env, now };
  const graphSkillOpts: MaybeInstallGraphSkillLensRunnerWithAsdbOptions = { env, now };
  const instMemoryOpts: MaybeInstallInstitutionalMemoryLensRunnerWithAsdbOptions = { env, now };
  const codeIntelligenceOpts: MaybeInstallCodeIntelligenceLensRunnerWithAsdbOptions = { env, now };
  const securityDevSecOpsOpts: MaybeInstallSecurityDevSecOpsLensRunnerWithAsdbOptions = { env, now };

  const perKind: Record<GraphLensKind, boolean> = {
    rag: maybeInstallRagLensRunnerWithAsdb(ragOpts).installed,
    rac: maybeInstallRacLensRunnerWithAsdb(racOpts).installed,
    cag: maybeInstallCagLensRunnerWithAsdb(cagOpts).installed,
    graph_skill: maybeInstallGraphSkillLensRunnerWithAsdb(graphSkillOpts).installed,
    mcp: maybeInstallMcpLensRunnerWithAsdb(mcpOpts).installed,
    governance: maybeInstallGovernanceLensRunnerWithAsdb(governanceOpts).installed,
    runtime: maybeInstallRuntimeLensRunnerWithAsdb(runtimeOpts).installed,
    institutional_memory: maybeInstallInstitutionalMemoryLensRunnerWithAsdb(
      instMemoryOpts,
    ).installed,
    code_intelligence: maybeInstallCodeIntelligenceLensRunnerWithAsdb(
      codeIntelligenceOpts,
    ).installed,
    security_devsecops: maybeInstallSecurityDevSecOpsLensRunnerWithAsdb(
      securityDevSecOpsOpts,
    ).installed,
  };

  let installedCount = 0;
  for (const kind of GRAPH_LENS_KINDS) {
    if (perKind[kind]) installedCount += 1;
  }

  return {
    perKind,
    installedCount,
    fullyInstalled: installedCount === GRAPH_LENS_KINDS.length,
  };
}
