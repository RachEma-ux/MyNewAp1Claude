#!/usr/bin/env tsx
/**
 * check:governance-actions
 *
 * Verifies governance coverage for cross-module mutations:
 *   - Each module manifest declares its sensitive actions in
 *     `governanceActions`.
 *   - Sensitive actions (`risk: "high"` or `receiptRequired: true`) must
 *     have a corresponding entry in the existing
 *     `server/governance/action-key-map.ts` so that gates can recognise
 *     them. Missing entries are flagged.
 *
 * Heuristic-only — the platform's own governance engine remains the
 * runtime authority.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { MODULE_MAP, REPO_ROOT } from "./lib/module-graph";

async function main() {
  const errors: string[] = [];
  const warnings: string[] = [];

  const actionKeyMapPath = join(REPO_ROOT, "server/governance/action-key-map.ts");
  let actionMapSrc = "";
  if (existsSync(actionKeyMapPath)) {
    actionMapSrc = readFileSync(actionKeyMapPath, "utf8");
  } else {
    warnings.push(`server/governance/action-key-map.ts missing — coverage check is best-effort`);
  }

  let totalDeclared = 0;
  let totalCovered = 0;

  try {
    const { registerAllManifests } = await import(
      `${REPO_ROOT}/server/platform/modules/manifests.ts`
    );
    const { getModuleRegistry, __resetModuleRegistryForTests } = await import(
      `${REPO_ROOT}/server/platform/modules/registry.ts`
    );
    __resetModuleRegistryForTests();
    registerAllManifests();
    const list = getModuleRegistry().list();
    for (const m of list as any[]) {
      const actions = (m.governanceActions ?? []) as any[];
      for (const a of actions) {
        totalDeclared++;
        const key = a.key;
        if (actionMapSrc && !actionMapSrc.includes(key)) {
          warnings.push(`Module '${m.key}' declares action '${key}' but no entry in action-key-map.ts`);
        } else {
          totalCovered++;
        }
      }
    }
  } catch (err) {
    errors.push(`Failed to load manifests: ${(err as Error).message}`);
  }

  for (const w of warnings) console.warn(`[WARN]  ${w}`);
  for (const e of errors) console.error(`[ERROR] ${e}`);
  if (errors.length) {
    console.error(`\n${errors.length} governance-action error(s), ${warnings.length} warning(s).`);
    process.exit(1);
  }
  console.log(
    `OK — governance-actions: ${totalDeclared} declared, ${totalCovered} covered, ${warnings.length} uncovered (warning).`,
  );
  // Force-exit: the manifest barrel pulls in modules whose top-level code
  // starts intervals (agent-studio scheduler, mcp reconnect timer) that keep
  // the event loop alive. The check itself is complete.
  process.exit(0);
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(2);
});
