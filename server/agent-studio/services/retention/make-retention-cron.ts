/**
 * Shared retention-cron factory.
 *
 * Phase 22 follow-up #642 — DRY refactor consolidating the scaffold
 * that was copy-pasted across 6 daily-sweep retention crons
 * (#612 workspace-observability, #622 runtime-runs, #626
 * tool-call-traces, #630 mcp-transitions, #634 catalog-sync-log,
 * #639 rac-runtime-traces).
 *
 * The scaffold each cron needs is identical except for:
 *   - log prefix (`[ags-foo-retention-cron]`)
 *   - env var prefix (`AGS_FOO_RETENTION_CRON_DISABLED` / `_EXPR` /
 *     `_DAYS`)
 *   - default cron expression + retention days
 *   - how `olderThan` (computed from retentionDays) is folded into the
 *     prune service's sweep input
 *   - the prune service to call
 *   - the per-result log-line tail
 *
 * Everything else — minute-key dedup, disabled/no_match/deduped/
 * swept_error skip reasons, status-getter split (lastRunAt + lastResult
 * only advance on success, lastError set on failure + cleared on next
 * success), idempotent ensureStarted, 60s setInterval with
 * `timer.unref()`, `process.on('exit')` cleanup, test-only state reset
 * — is the same across the 6 modules and lives here.
 *
 * Behavior-preservation contract: the factory was extracted from the
 * 6 existing `*-cron.ts` modules so they produce identical
 * observable behavior (cron matching, dedup keys, return shapes,
 * env-var resolution, log line text, status getter shape). The unit
 * test suites for all 6 crons run unchanged against the refactored
 * modules.
 */

import { matchesCron } from "../scheduler.js";

const TICK_INTERVAL_MS = 60_000;

export interface RetentionCronEnsureState<TResult> {
  lastRunMinuteKey: string | null;
  lastRunAt: Date | null;
  lastResult: TResult | null;
  lastError: string | null;
}

export interface RetentionCronStatus<TResult> {
  readonly lastRunAt: Date | null;
  readonly lastResult: TResult | null;
  readonly lastError: string | null;
}

export interface TickRetentionCronOptions<TSweepInput, TResult> {
  /** Override `now` for deterministic testing. */
  readonly now?: Date;
  /** Cron expression. Defaults to env / config.defaultCronExpr. */
  readonly cronExpr?: string;
  /** Override the disabled-flag for tests (defaults to env). */
  readonly disabled?: boolean;
  /** Retention window override. If the cron has no retention envelope
   * (config.defaultRetentionDays === null), this is ignored. */
  readonly retentionDays?: number;
  /** Partial sweep input merged with the factory-computed olderThan
   * (per the config's buildSweepInput rule). */
  readonly sweepInput?: TSweepInput;
  /** Test seam — replaces the default prune-service call entirely. */
  readonly runSweep?: (input: TSweepInput) => Promise<TResult>;
  /** Override the in-process dedup state (test seam). */
  readonly state?: RetentionCronEnsureState<TResult>;
  /** Override `console.warn` for tests. */
  readonly warn?: (message: string, ...args: unknown[]) => void;
  /** Override `console.log` for tests. */
  readonly log?: (message: string, ...args: unknown[]) => void;
}

export interface TickRetentionCronResult<TResult> {
  readonly fired: boolean;
  readonly skippedReason?:
    | "disabled"
    | "no_match"
    | "deduped"
    | "swept_error";
  readonly result?: TResult;
}

export interface MakeRetentionCronConfig<TSweepInput, TResult> {
  /** Log prefix (without brackets), e.g. `"ags-rac-runtime-traces-retention-cron"`. */
  readonly logPrefix: string;
  /** Env var prefix; the factory reads `${envPrefix}_CRON_DISABLED`,
   * `${envPrefix}_CRON_EXPR`, and (if defaultRetentionDays !== null)
   * `${envPrefix}_DAYS`. Example: `"AGS_RAC_RUNTIME_TRACES_RETENTION"`. */
  readonly envPrefix: string;
  /** Default cron expression (e.g. `"0 8 * * *"`). */
  readonly defaultCronExpr: string;
  /** Default retention days. If `null`, this cron has no retention
   * envelope — `olderThan` is computed as `null` and passed into
   * `buildSweepInput` unchanged; `_DAYS` env var is not read. */
  readonly defaultRetentionDays: number | null;
  /** Compose the per-tick sweep input from the per-tick caller's
   * `sweepInput` and the factory-computed `olderThan`. For most
   * crons this is `{ olderThan, ...sweepInput }`; for crons that
   * carry their own per-table cutoffs internally (e.g. the
   * workspace-observability bundled sweep) it's `sweepInput ?? {}`. */
  readonly buildSweepInput: (params: {
    olderThan: Date | null;
    sweepInput?: TSweepInput;
  }) => TSweepInput;
  /** Default prune-service call (used when TickOptions.runSweep is
   * not set). */
  readonly runSweep: (input: TSweepInput) => Promise<TResult>;
  /** Format the success log line tail (after `[prefix] swept — `). */
  readonly formatSweepLogTail: (
    result: TResult,
    retentionDays: number | null,
  ) => string;
  /** Format the startup log line tail (after `[prefix] started — 60s
   * tick, cron='X' (UTC)`). Optional — when omitted, no tail is
   * appended. */
  readonly formatStartupLogTail?: (params: {
    retentionDays: number | null;
  }) => string;
}

export interface RetentionCronModule<TSweepInput, TResult> {
  readonly DEFAULT_CRON_EXPR: string;
  /** `null` when the cron has no retention envelope. */
  readonly DEFAULT_RETENTION_DAYS: number | null;
  tick(
    options?: TickRetentionCronOptions<TSweepInput, TResult>,
  ): Promise<TickRetentionCronResult<TResult>>;
  getStatus(
    state?: RetentionCronEnsureState<TResult>,
  ): RetentionCronStatus<TResult>;
  ensureStarted(): void;
  resetForTests(): void;
}

export function makeRetentionCron<TSweepInput, TResult>(
  config: MakeRetentionCronConfig<TSweepInput, TResult>,
): RetentionCronModule<TSweepInput, TResult> {
  const ENV_DISABLED = `${config.envPrefix}_CRON_DISABLED`;
  const ENV_EXPR = `${config.envPrefix}_CRON_EXPR`;
  const ENV_DAYS = `${config.envPrefix}_DAYS`;

  const moduleState: RetentionCronEnsureState<TResult> = {
    lastRunMinuteKey: null,
    lastRunAt: null,
    lastResult: null,
    lastError: null,
  };

  function minuteKey(d: Date): string {
    return d.toISOString().slice(0, 16);
  }

  function resolveCronExpr(override?: string): string {
    if (typeof override === "string" && override.length > 0) return override;
    const env = process.env[ENV_EXPR];
    if (typeof env === "string" && env.length > 0) return env;
    return config.defaultCronExpr;
  }

  function resolveDisabled(override?: boolean): boolean {
    if (typeof override === "boolean") return override;
    const env = process.env[ENV_DISABLED];
    return env === "1" || env === "true";
  }

  function resolveRetentionDays(override?: number): number | null {
    if (config.defaultRetentionDays === null) return null;
    if (typeof override === "number" && override > 0) return override;
    const env = process.env[ENV_DAYS];
    if (typeof env === "string") {
      const parsed = parseInt(env, 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return config.defaultRetentionDays;
  }

  async function tick(
    options: TickRetentionCronOptions<TSweepInput, TResult> = {},
  ): Promise<TickRetentionCronResult<TResult>> {
    const now = options.now ?? new Date();
    const warn = options.warn ?? console.warn;
    const log = options.log ?? console.log;
    const state = options.state ?? moduleState;

    if (resolveDisabled(options.disabled)) {
      return { fired: false, skippedReason: "disabled" };
    }

    const cronExpr = resolveCronExpr(options.cronExpr);
    if (!matchesCron(cronExpr, now)) {
      return { fired: false, skippedReason: "no_match" };
    }

    const key = minuteKey(now);
    if (state.lastRunMinuteKey === key) {
      return { fired: false, skippedReason: "deduped" };
    }
    state.lastRunMinuteKey = key;

    const retentionDays = resolveRetentionDays(options.retentionDays);
    const olderThan =
      retentionDays === null
        ? null
        : new Date(now.getTime() - retentionDays * 86_400_000);
    const sweepArg = config.buildSweepInput({
      olderThan,
      sweepInput: options.sweepInput,
    });

    const sweep = options.runSweep ?? config.runSweep;
    try {
      const result = await sweep(sweepArg);
      state.lastRunAt = now;
      state.lastResult = result;
      state.lastError = null;
      log(
        `[${config.logPrefix}] swept — ${config.formatSweepLogTail(result, retentionDays)}`,
      );
      return { fired: true, result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      state.lastError = msg;
      warn(`[${config.logPrefix}] sweep failed: ${msg}`);
      // Slice 20 of the no-deferral catalogue (2026-05-19): bridge
      // every cron failure to the Phase 22 closed-taxonomy emission
      // surface via `background_job_failed`. Operators querying
      // failure-state events by kind now see the cron failures
      // alongside the alert system. Fire-and-forget; observability
      // writes never propagate back to the cron return path.
      void (async () => {
        try {
          const { recordFailureStateEvent } = await import(
            "../failure-states/observability-bridge.js"
          );
          await recordFailureStateEvent({
            failureState: "background_job_failed",
            sourceKind: `cron.${config.logPrefix}`,
            sourceId: config.logPrefix,
            errorMessage: msg,
            metadata: {
              cron: config.defaultCronExpr,
              envPrefix: config.envPrefix,
            },
          });
        } catch {
          /* fail-soft */
        }
      })();
      return { fired: false, skippedReason: "swept_error" };
    }
  }

  function getStatus(
    state: RetentionCronEnsureState<TResult> = moduleState,
  ): RetentionCronStatus<TResult> {
    return {
      lastRunAt: state.lastRunAt,
      lastResult: state.lastResult,
      lastError: state.lastError,
    };
  }

  let started = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  function ensureStarted(): void {
    if (started) return;
    if (resolveDisabled()) {
      console.log(
        `[${config.logPrefix}] disabled via ${ENV_DISABLED}`,
      );
      started = true;
      return;
    }
    started = true;
    timer = setInterval(() => {
      tick().catch((err) => {
        console.error(`[${config.logPrefix}] tick crashed:`, err);
      });
    }, TICK_INTERVAL_MS);
    if (timer && typeof timer.unref === "function") {
      timer.unref();
    }
    process.on("exit", () => {
      if (timer) clearInterval(timer);
    });
    const cron = resolveCronExpr();
    const retentionDays = resolveRetentionDays();
    const tail = config.formatStartupLogTail
      ? `, ${config.formatStartupLogTail({ retentionDays })}`
      : "";
    console.log(
      `[${config.logPrefix}] started — 60s tick, cron='${cron}' (UTC)${tail}`,
    );
  }

  function resetForTests(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    started = false;
    moduleState.lastRunMinuteKey = null;
    moduleState.lastRunAt = null;
    moduleState.lastResult = null;
    moduleState.lastError = null;
  }

  return {
    DEFAULT_CRON_EXPR: config.defaultCronExpr,
    DEFAULT_RETENTION_DAYS: config.defaultRetentionDays,
    tick,
    getStatus,
    ensureStarted,
    resetForTests,
  };
}
