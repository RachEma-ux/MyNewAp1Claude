/**
 * Staging Integration Test Runner
 *
 * Runs the full vitest suite (including `tests/integration/**`)
 * in `TEST_MODE=staging-integration` mode.
 *
 * Behaviour:
 *  - Verifies the live-staging environment up front via the shared
 *    preflight reporter at `scripts/staging-foundation/preflight.ts`.
 *    Missing infra is reported clearly to stderr (and the script
 *    exits non-zero with a BLOCKED status) — it is *not* downgraded
 *    to a skip, because docs/deployment/staging-runtime-foundation.md
 *    explicitly says missing staging infra must surface as a real
 *    failure.
 *  - When all infra is present, delegates to `vitest run` and
 *    forwards its exit code.
 *  - The TEST_MODE env var flips the `skipUnlessInfra` helper in
 *    `tests/_helpers/test-modes.ts` from `skip → run`, so
 *    env-dependent tests assert against the live stack.
 *
 * The infra contract is owned by the preflight module — adding a
 * new required env key is a one-liner there, and every consumer
 * (this runner, future CI checks, future evidence generators)
 * picks it up automatically.
 */

import { spawnSync } from "node:child_process";
import { runPreflight, formatHuman } from "./staging-foundation/preflight";

function main(): never {
  const report = runPreflight();

  if (!report.allRequiredOk) {
    process.stderr.write(formatHuman(report) + "\n");
    process.exit(2);
  }

  process.stdout.write(formatHuman(report) + "\n");

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
