/**
 * Agent Studio manifest + routes.tsx — route inventory sync check.
 * PR-V1-178.
 *
 * Source-scan that both the manifest's `routeInventory` array and
 * the routes.tsx `agentStudioRoutes` array enumerate the 6 admin
 * paths shipped through this session. Before this slice the
 * `check:module-route-inventory` tooling could (silently or noisily)
 * flag drift since the admin pages dispatched in the Shell without
 * a manifest declaration.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const ADMIN_PATHS = [
  "/agent-studio/vault-attachments",
  "/agent-studio/vault-saved-views",
  "/agent-studio/canvas-projection-events-drain",
  "/agent-studio/canvas-operator",
  "/agent-studio/region-admin",
  "/agent-studio/extensions-admin",
  "/agent-studio/mcp-manager",
  "/agent-studio/bases-admin",
] as const;

describe("PR-V1-178 — manifest + routes route inventory sync", () => {
  const manifest = readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/manifest.ts",
    ),
    "utf8",
  );
  const routes = readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/routes.tsx",
    ),
    "utf8",
  );

  for (const p of ADMIN_PATHS) {
    it(`manifest.routeInventory includes ${p}`, () => {
      expect(manifest).toContain(`"${p}"`);
    });
    it(`routes.tsx agentStudioRoutes includes ${p}`, () => {
      expect(routes).toContain(`path: "${p}"`);
    });
  }
});
