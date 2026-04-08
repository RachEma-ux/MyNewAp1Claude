/**
 * AI Agent Studio — Boot Entry Point
 *
 * Phase 12.5: single-call boot for the entire Agent Studio module.
 * Called once from server/_core/index.ts at startup. Replaces both
 * the previous (implicit) DB-via-main-app pattern AND the Phase 10
 * scheduler self-start side effect.
 *
 * Why a wrapper module:
 *  - Keeps the platform-file edit at +1 line in _core/index.ts (under
 *    the 22-line additive footprint budget). Without this, we'd add
 *    5 lines for the seed try/catch + extra lines for any future
 *    Agent Studio boot work.
 *  - Formalizes the Phase 10 scheduler self-start. Previously the
 *    scheduler used a top-level `ensureSchedulerStarted()` side
 *    effect at module-load time, kicked off when the runtime
 *    sub-router imported it. That implicit pattern is fragile
 *    (depends on import order) — the explicit boot call here is
 *    cleaner and easier to audit.
 *  - Mirrors how server/_core/index.ts already wires per-module seed
 *    functions (seedWfDb, seedPrmDb, seedPsmDb, seedCodeDb).
 *
 * What this function does, in order:
 *  1. Seed ASDB — runs CREATE TABLE IF NOT EXISTS for all 32 ags_*
 *     tables. Idempotent. Failures logged but non-fatal.
 *  2. Start the Phase 10 scheduler — 60s tick loop that fires
 *     scheduled agents. Uses unref() so it doesn't keep the dev
 *     server alive after exit.
 */

export async function bootAgentStudio(): Promise<void> {
  // Step 1: ASDB schema seed (Phase 12.5)
  try {
    const { seedAsDb } = await import("./db/seed");
    await seedAsDb();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ASDB] Seed skipped — ${message}`);
  }

  // Step 2: Phase 10 scheduler — formalized boot path
  try {
    const { ensureSchedulerStarted } = await import("./services/scheduler");
    ensureSchedulerStarted();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[ags-scheduler] start skipped — ${message}`);
  }
}
