/**
 * Test-mode helpers — local-unit vs staging-integration
 *
 * Tests in this repo fall into three groups:
 *
 *  1. Pure unit/structural tests
 *     Always run. No external dependencies.
 *
 *  2. Env-dependent tests (DB / OPA / secrets / workers / orchestrator)
 *     Skipped automatically when the required infrastructure is
 *     not present, so `pnpm run test:unit` is clean on a developer
 *     machine without a live staging stack. They run as real
 *     assertions when invoked via `pnpm run test:integration:staging`
 *     against a configured staging environment.
 *
 *  3. Staging-only tests (under `tests/integration/**`)
 *     Excluded from unit-mode by vitest config. Only run in
 *     staging-integration mode.
 *
 * The infra predicates are evaluated lazily at test collection time
 * by reading process.env so individual tests do not import
 * `server/db/connection` etc. at top level.
 */

const truthyEnv = (name: string): boolean => {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
};

/** A `DATABASE_URL` is configured. */
export const hasDb = (): boolean => truthyEnv("DATABASE_URL");

/**
 * The OPA endpoint is configured AND points at something other than
 * the placeholder `opa.example.com` host that lives in dev/test
 * fallbacks. We also accept `OPA_BASE_URL` (legacy alias).
 */
export const hasOpa = (): boolean => {
  const url = process.env.OPA_URL || process.env.OPA_BASE_URL || "";
  if (!url) return false;
  if (url.includes("opa.example.com")) return false;
  return true;
};

/** Production-mode secret keys are configured. */
export const hasSecrets = (): boolean =>
  truthyEnv("ENCRYPTION_KEY") &&
  truthyEnv("SECRETS_ENCRYPTION_KEY") &&
  truthyEnv("COOKIE_SECRET") &&
  truthyEnv("JWT_SECRET");

/** A live agent runtime / orchestrator endpoint is configured. */
export const hasOrchestrator = (): boolean =>
  truthyEnv("EXTERNAL_ORCHESTRATOR_URL");

/** Any worker queue is reachable (Redis / pg-boss). */
export const hasWorkerQueue = (): boolean =>
  truthyEnv("REDIS_URL") || truthyEnv("WORKER_QUEUE_URL");

/**
 * True when invoked via `pnpm run test:integration:staging`. In that
 * mode, missing infra is an error, not a skip — the run helpers in
 * this file convert the missing-infra signal accordingly.
 */
export const isStagingIntegrationMode = (): boolean =>
  process.env.TEST_MODE === "staging-integration";

/**
 * Build a `describe.skipIf` predicate that:
 *   - returns `true` (= skip) when local-unit mode and the
 *     prerequisite is missing (so the suite is reported as
 *     skipped, not failed);
 *   - returns `false` (= run) in staging-integration mode so the
 *     suite executes and surfaces real failures if infra is broken.
 */
export const skipUnlessInfra = (predicate: () => boolean): boolean => {
  if (isStagingIntegrationMode()) {
    // Run — let the assertion or transport fail clearly.
    return false;
  }
  return !predicate();
};
