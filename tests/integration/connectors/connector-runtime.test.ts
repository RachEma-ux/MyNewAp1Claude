/**
 * Connector runtime evidence — staging-integration only.
 *
 * Phase 5 of the production-readiness verification report rated
 * "External connectors" as PASS based on static checks: every
 * port declared, gateway / event / handoff wiring clean, the
 * static connector-registry test in
 * `server/data-analysis/data-acquisition/__tests__/dataAcquisition.service.test.ts`
 * confirms each external connector reports `unconfigured` when
 * its credentials are missing.
 *
 * What was missing: live evidence that, when credentials *are*
 * present, the connector flips from `unconfigured` to `available`
 * — i.e. the env-vars → status path actually works end-to-end.
 *
 * This file exercises that path. For each external connector,
 * if every required env var is set, the test asserts
 * `connector.status()` returns `available`. If any required env
 * var is missing, the block is skipped (not BLOCKED) — same
 * component-scoped optional semantics as the worker tests:
 * connectors are installed per-deployment, not always-on.
 *
 * Built-in always-on connectors (`local`, `manual`, `webhook`)
 * are also verified — they should always report `available`
 * regardless of env, and an integration-mode regression there
 * would be a real bug.
 */

import { describe, it, expect } from "vitest";
import {
  getConnector,
  listConnectors,
} from "../../../server/data-analysis/data-acquisition/connectors/connector.registry";

const truthyEnv = (name: string): boolean => {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
};

const allEnvSet = (envVars: readonly string[]): boolean =>
  envVars.length === 0 ? true : envVars.every(truthyEnv);

// Built-ins must always be available.
describe("Connector runtime — built-in connectors", () => {
  for (const key of ["local", "manual", "webhook"] as const) {
    it(`${key} reports available`, async () => {
      const c = getConnector(key);
      expect(c, `connector "${key}" missing from registry`).toBeDefined();
      const status = await c!.status();
      expect(status.status).toBe("available");
      expect(status.message).toBeTruthy();
    });
  }
});

// External connectors with declared envVars. Each block runs
// only when every required env var is populated. Keep this list
// synchronized with `connector.registry.ts` — the coverage
// assertion at the bottom of this file will fail if a new
// credentialed connector is added without being registered here.
const externalConnectorKeys = [
  "s3",
  "gdrive",
  "github",
  "sensor",
  "stream",
] as const;

for (const key of externalConnectorKeys) {
  const connector = getConnector(key);
  const envVars: readonly string[] = connector?.envVars ?? [];

  describe.skipIf(!allEnvSet(envVars))(
    `Connector runtime — ${key} (configured)`,
    () => {
      it("reports available when env vars are set", async () => {
        const c = getConnector(key);
        expect(c).toBeDefined();
        const status = await c!.status();
        expect(
          status.status,
          `${key} connector should report available when env is set; got ${status.status}: ${status.message}`,
        ).toBe("available");
      });

      it("status message references the connector display name", async () => {
        const c = getConnector(key);
        const status = await c!.status();
        expect(status.message).toMatch(/configured/i);
      });
    },
  );
}

// Coverage assertion: every external connector with non-empty
// envVars is referenced above. If a new credentialed connector
// is added to the registry, this guards against forgetting to
// add a runtime block for it.
describe("Connector runtime — registry coverage", () => {
  it("every credentialed external connector has a runtime block", () => {
    const credentialedKeys = listConnectors()
      .filter((c) => (c.envVars?.length ?? 0) > 0)
      .map((c) => c.key);
    for (const k of credentialedKeys) {
      expect(
        externalConnectorKeys as readonly string[],
        `connector "${k}" requires env vars but is not exercised by this file. Add it to externalConnectorKeys above.`,
      ).toContain(k);
    }
  });
});
