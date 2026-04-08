/**
 * AI Agent Studio — Scheduler
 *
 * Phase 10 of the Agent Studio remaining-phases plan. Fires `runSimulation`
 * for any agent whose draft has `scheduleConfig.enabled = true` when the
 * cron expression matches the current minute.
 *
 * Design notes:
 *  - Self-starting: top-level side effect kicks in when this module is
 *    first imported. The runtime tRPC sub-router imports it transitively,
 *    so the scheduler comes alive on the first agent-studio API call. No
 *    edits to server/_core/index.ts (preserves the 22-line additive
 *    footprint constraint from §4.2 of the unified plan).
 *  - Tick interval: 60s. The cron evaluator only resolves to the minute,
 *    so a 1-minute tick is sufficient and matches existing automation
 *    engine semantics.
 *  - Dedup: each fire writes `lastRunAt` (ISO string) into the draft's
 *    `scheduleConfig`. If `lastRunAt` is in the same minute as `now`, the
 *    scheduler skips it — protects against duplicate fires across server
 *    restarts within the same minute.
 *  - No external cron parser dependency. Supports the common subset:
 *      star            every value
 *      N               literal
 *      star/N          every Nth value (step from 0)
 *      A,B,C           list
 *      A-B             range (no step)
 *    Field order: minute hour day-of-month month day-of-week.
 *    (We say "star" instead of the asterisk character above because
 *    inside a JSDoc comment, "asterisk-slash" would close the comment.)
 *  - Shutdown: process.on('exit') clears the interval, so the scheduler
 *    doesn't outlive the dev server.
 *
 * Public API:
 *  - matchesCron(expression, date) — pure cron evaluator
 *  - tickScheduler() — single tick, exposed for tests / manual fire
 *  - ensureSchedulerStarted() — idempotent boot helper called by the
 *    runtime sub-router import path
 */

import * as repo from "../repository";
import { runSimulation } from "./simulation";

const TICK_INTERVAL_MS = 60_000;

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

// ── Cron evaluator ──────────────────────────────────────────────────────────

/**
 * Parse a single cron field and check if it matches the given value.
 *
 * Supported syntax:
 *   "*"        → always
 *   "5"        → exact value
 *   "1,3,5"    → list
 *   "1-5"      → range
 *   "* /5"     → every 5 (without space)
 *
 * `min`/`max` constrain the field's valid range so wildcards expand
 * correctly (e.g. minute 0..59, hour 0..23).
 */
function matchField(field: string, value: number, min: number, max: number): boolean {
  if (field === "*") return true;

  // Step expression: "*/5" or "10/5"
  if (field.includes("/")) {
    const [base, stepStr] = field.split("/");
    const step = parseInt(stepStr, 10);
    if (!Number.isFinite(step) || step <= 0) return false;
    const start = base === "*" ? min : parseInt(base, 10);
    if (!Number.isFinite(start)) return false;
    return value >= start && (value - start) % step === 0 && value <= max;
  }

  // List expression: "1,3,5"
  if (field.includes(",")) {
    return field.split(",").some((part) => matchField(part, value, min, max));
  }

  // Range expression: "1-5"
  if (field.includes("-")) {
    const [a, b] = field.split("-").map((s) => parseInt(s, 10));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return value >= a && value <= b;
  }

  // Literal
  const literal = parseInt(field, 10);
  return Number.isFinite(literal) && literal === value;
}

/**
 * Pure cron evaluator: returns true when the 5-field expression matches
 * the given date (minute granularity). Day-of-month and day-of-week are
 * OR'd together when both are specified, matching POSIX cron semantics —
 * EXCEPT when one of them is "*", in which case only the other is checked
 * (otherwise "0 9 * * 1" would fire every day instead of only Mondays).
 */
export function matchesCron(expression: string, date: Date): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [minF, hourF, domF, monF, dowF] = fields;

  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();
  const dom = date.getUTCDate();
  const month = date.getUTCMonth() + 1; // 1-12
  const dow = date.getUTCDay(); // 0-6, 0=Sunday

  if (!matchField(minF, minute, 0, 59)) return false;
  if (!matchField(hourF, hour, 0, 23)) return false;
  if (!matchField(monF, month, 1, 12)) return false;

  // POSIX-ish: when both DOM and DOW are restricted, OR them; when one
  // is "*", only check the other.
  if (domF === "*" && dowF === "*") return true;
  if (domF === "*") return matchField(dowF, dow, 0, 6);
  if (dowF === "*") return matchField(domF, dom, 1, 31);
  return (
    matchField(domF, dom, 1, 31) || matchField(dowF, dow, 0, 6)
  );
}

// ── Tick ────────────────────────────────────────────────────────────────────

/**
 * Single scheduler tick. Fetches all agents with enabled schedules,
 * evaluates each one's cron against `now`, fires the matching ones, and
 * stamps `lastRunAt` to dedupe.
 *
 * Errors per-agent are caught and logged so one bad schedule doesn't
 * poison the rest of the tick.
 */
export async function tickScheduler(now: Date = new Date()): Promise<{
  evaluated: number;
  fired: number;
  skipped: number;
  errors: number;
}> {
  let evaluated = 0;
  let fired = 0;
  let skipped = 0;
  let errors = 0;

  let scheduledAgents: Array<{
    agentId: number;
    draftId: number;
    config: Record<string, unknown>;
  }>;
  try {
    scheduledAgents = await repo.listScheduledAgents();
  } catch (err) {
    console.error("[ags-scheduler] failed to list scheduled agents:", err);
    return { evaluated: 0, fired: 0, skipped: 0, errors: 1 };
  }

  for (const sched of scheduledAgents) {
    evaluated++;
    const cron = typeof sched.config.cron === "string" ? sched.config.cron : null;
    if (!cron) {
      skipped++;
      continue;
    }
    if (!matchesCron(cron, now)) {
      skipped++;
      continue;
    }
    // Dedup against lastRunAt within the same minute
    const lastRunAt = sched.config.lastRunAt;
    if (typeof lastRunAt === "string") {
      const last = new Date(lastRunAt);
      if (
        last.getUTCFullYear() === now.getUTCFullYear() &&
        last.getUTCMonth() === now.getUTCMonth() &&
        last.getUTCDate() === now.getUTCDate() &&
        last.getUTCHours() === now.getUTCHours() &&
        last.getUTCMinutes() === now.getUTCMinutes()
      ) {
        skipped++;
        continue;
      }
    }

    // Fire — best-effort, isolated per-agent error handling
    try {
      const payload =
        sched.config.payload && typeof sched.config.payload === "object"
          ? (sched.config.payload as Record<string, unknown>)
          : { source: "scheduler", cron };
      await runSimulation({
        agentId: sched.agentId,
        inputPayload: payload,
        toggles: { mockedTools: false },
      });
      // Stamp lastRunAt
      const nextConfig = { ...sched.config, lastRunAt: now.toISOString() };
      await repo.updateScheduleConfigByDraftId(sched.draftId, nextConfig);
      fired++;
    } catch (err) {
      errors++;
      console.error(
        `[ags-scheduler] agent ${sched.agentId} schedule fire failed:`,
        err
      );
    }
  }

  return { evaluated, fired, skipped, errors };
}

// ── Boot ────────────────────────────────────────────────────────────────────

/**
 * Idempotent. Starts the 60s tick loop the first time it's called and
 * registers a process.on('exit') cleanup. Calling it again is a no-op.
 *
 * The runtime sub-router imports this module, so the side-effect call at
 * the bottom of this file kicks in on the first agent-studio API hit —
 * no edits to server/_core/index.ts required.
 */
export function ensureSchedulerStarted(): void {
  if (started) return;
  started = true;
  timer = setInterval(() => {
    tickScheduler().catch((err) => {
      console.error("[ags-scheduler] tick crashed:", err);
    });
  }, TICK_INTERVAL_MS);
  // Don't keep the process alive just for the scheduler — if the dev
  // server has nothing else pending, let it exit cleanly.
  if (timer && typeof timer.unref === "function") {
    timer.unref();
  }
  process.on("exit", () => {
    if (timer) clearInterval(timer);
  });
  console.log("[ags-scheduler] started — 60s tick");
}

// Phase 12.5: removed the side-effect self-start. The scheduler is now
// started explicitly via bootAgentStudio() in server/agent-studio/boot.ts
// (called from _core/index.ts). This is more deterministic — the previous
// import-order-driven start was hard to audit.
