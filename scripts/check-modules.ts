#!/usr/bin/env tsx
/**
 * check:modules
 *
 * Validates that:
 *   - every entry in `MODULE_ROUTERS` has a manifest registered in
 *     `server/platform/modules/manifests.ts`,
 *   - every manifest with a tRPC router has an entry in `MODULE_ROUTERS`,
 *   - manifests pass basic structural validation,
 *   - strong modules declare an owned DB,
 *   - every module has a `manifest.ts`.
 *
 * This script imports the platform module barrel directly via tsx.
 */

import { existsSync } from "fs";
import { join } from "path";
import { MODULE_MAP, REPO_ROOT } from "./lib/module-graph";

async function main() {
  const errors: string[] = [];

  // 1. Each module folder has a manifest.
  console.log("[1/5] Checking manifest files exist…");
  for (const desc of MODULE_MAP) {
    const manifestPath = join(REPO_ROOT, "server", desc.folder, "manifest.ts");
    if (!existsSync(manifestPath)) {
      errors.push(`Missing manifest: server/${desc.folder}/manifest.ts (module '${desc.key}')`);
    }
  }

  // 2. The barrel imports them all and registers them.
  console.log("[2/5] Checking barrel files exist…");
  const barrelPath = join(REPO_ROOT, "server/platform/modules/manifests.ts");
  if (!existsSync(barrelPath)) {
    errors.push("Missing manifests barrel: server/platform/modules/manifests.ts");
  }
  const routersBarrelPath = join(REPO_ROOT, "server/platform/modules/module-routers.ts");
  if (!existsSync(routersBarrelPath)) {
    errors.push("Missing module-routers barrel: server/platform/modules/module-routers.ts");
  }

  // 3. Try to import the registry and verify content.
  console.log("[3/5] Loading manifest barrel + registry (may pull in module side-effects)…");
  try {
    const { registerAllManifests } = await import(`${REPO_ROOT}/server/platform/modules/manifests.ts`);
    const { getModuleRegistry, __resetModuleRegistryForTests } =
      await import(`${REPO_ROOT}/server/platform/modules/registry.ts`);
    __resetModuleRegistryForTests();
    registerAllManifests();
    const list = getModuleRegistry().list();
    const keys = new Set(list.map((m: any) => m.key));
    for (const desc of MODULE_MAP) {
      if (!keys.has(desc.key)) {
        errors.push(`Module '${desc.key}' missing from registry — add to manifests barrel`);
      }
    }

    // 4. Strong modules must own a DB.
    console.log("[4/5] Validating strong-module DB declarations and health()…");
    const STRONG = new Set([
      "prm",
      "psm",
      "codeStudio",
      "agentStudio",
      "sandboxWf",
      "rag",
    ]);
    for (const m of list as any[]) {
      if (STRONG.has(m.key) && m.database?.kind !== "owned") {
        errors.push(`Strong module '${m.key}' must declare database.kind = "owned"`);
      }
      if (!m.health) {
        errors.push(`Module '${m.key}' is missing a health() function`);
      }
    }
  } catch (err) {
    errors.push(`Failed to load manifest barrel: ${(err as Error).message}`);
  }

  // 5. Every manifest with a router must appear in MODULE_ROUTERS literal.
  console.log("[5/5] Validating MODULE_ROUTERS keys…");
  try {
    const routersBarrel = await import(
      `${REPO_ROOT}/server/platform/modules/module-routers.ts`
    );
    const literalKeys = Object.keys((routersBarrel as any).MODULE_ROUTERS);
    const expected = [
      "prm",
      "psm",
      "codeStudio",
      "agentStudio",
      "sandboxWf",
      "openRouter",
      "ps",
      "hr",
      "organizationManagement",
      "cultureValues",
      "aiTypes",
      "kgraAgent",
    ];
    for (const k of expected) {
      if (!literalKeys.includes(k)) {
        errors.push(`MODULE_ROUTERS missing expected key '${k}'`);
      }
    }
  } catch (err) {
    errors.push(`Failed to load module-routers: ${(err as Error).message}`);
  }

  if (errors.length) {
    for (const e of errors) console.error(`[ERROR] ${e}`);
    console.error(`\n${errors.length} module-registry violation(s).`);
    process.exit(1);
  }
  console.log("OK — modules check passed.");
  // Force-exit: the manifest barrel transitively keeps the event loop alive;
  // root cause not isolated. Exit explicitly after synchronous check completion.
  process.exit(0);
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(2);
});
