/**
 * Staging Integration Test Runner
 *
 * Runs the full vitest suite (including `tests/integration/**`)
 * in `TEST_MODE=staging-integration` mode.
 *
 * Behaviour:
 *  - Verifies the live-staging environment up front. Missing infra
 *    is reported clearly to stderr (and the script exits non-zero
 *    with a BLOCKED status) — it is *not* downgraded to a skip,
 *    because PR 7's docs/deployment/staging-readiness.md explicitly
 *    says missing staging infra must surface as a real failure.
 *  - When all infra is present, delegates to `vitest run` and
 *    forwards its exit code.
 *  - The TEST_MODE env var flips the `skipUnlessInfra` helper in
 *    `tests/_helpers/test-modes.ts` from `skip → run`, so
 *    env-dependent tests assert against the live stack.
 */

import { spawnSync } from "node:child_process";

interface InfraCheck {
  name: string;
  ok: boolean;
  hint: string;
}

function checkInfra(): InfraCheck[] {
  const checks: InfraCheck[] = [];

  // Databases
  checks.push({
    name: "DATABASE_URL (mynewap1claude)",
    ok: !!process.env.DATABASE_URL,
    hint: "Set DATABASE_URL to the staging mynewap1claude Postgres DSN.",
  });

  // OPA
  const opaUrl = process.env.OPA_URL || process.env.OPA_BASE_URL || "";
  const opaOk = opaUrl.length > 0 && !opaUrl.includes("opa.example.com");
  checks.push({
    name: "OPA_URL (real endpoint, not opa.example.com placeholder)",
    ok: opaOk,
    hint: "Set OPA_URL to the staging OPA endpoint. The placeholder opa.example.com is rejected.",
  });

  // Production-mode secrets
  for (const key of [
    "ENCRYPTION_KEY",
    "SECRETS_ENCRYPTION_KEY",
    "COOKIE_SECRET",
    "JWT_SECRET",
  ]) {
    checks.push({
      name: key,
      ok: !!process.env[key],
      hint: `Set ${key}. See docs/deployment/staging-env.example.md for the staging value source.`,
    });
  }

  return checks;
}

function reportBlocked(missing: InfraCheck[]): void {
  // eslint-disable-next-line no-console
  console.error(
    "\n[Staging Integration] BLOCKED — required infra is missing:",
  );
  for (const c of missing) {
    // eslint-disable-next-line no-console
    console.error(`  - ${c.name}\n    ${c.hint}`);
  }
  // eslint-disable-next-line no-console
  console.error(
    "\nThis is a real failure, not a skip. Provision staging and re-run\n" +
      "  pnpm run test:integration:staging\n" +
      "See docs/deployment/staging-readiness.md.",
  );
}

function main(): never {
  const checks = checkInfra();
  const missing = checks.filter((c) => !c.ok);

  if (missing.length > 0) {
    reportBlocked(missing);
    // Exit non-zero so CI surfaces a BLOCKED state.
    process.exit(2);
  }

  // eslint-disable-next-line no-console
  console.log(
    `[Staging Integration] All ${checks.length} infra checks passed; running full suite...`,
  );

  const result = spawnSync(
    process.execPath,
    [
      "--no-warnings",
      "node_modules/vitest/vitest.mjs",
      "run",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        TEST_MODE: "staging-integration",
      },
    },
  );

  process.exit(result.status ?? 1);
}

main();
