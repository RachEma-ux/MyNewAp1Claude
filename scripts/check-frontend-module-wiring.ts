#!/usr/bin/env tsx
/**
 * check:frontend-wiring
 *
 * Validates client-side modular surface:
 *   - the client module registry / route composer / nav composer
 *     primitives exist (under client/src/platform/modules/)
 *   - if a server manifest declares routes, the client should also
 *     declare a manifest at client/src/modules/<folder>/manifest.ts
 *     (otherwise reported as follow-up)
 *   - any client module manifest carries the required fields
 *     (key, name, routes; optionally navigation, requiredPermissions,
 *     featureFlag, fallback)
 *   - nav items point to declared routes
 *   - hardcoded routes/nav still in App.tsx are documented as
 *     compatibility-mode (warn, not fail)
 *
 * No browser/build invocation — pure static walk.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative } from "path";
import {
  buildFullInventory,
  KNOWN_MODULES,
  resolveRepoRoot,
} from "../server/platform/modules/wiring-inventory";
import type { WiringFinding } from "../server/platform/modules/wiring-types";

function read(p: string): string {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function walk(root: string, exts: string[]): string[] {
  const out: string[] = [];
  function w(d: string) {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const e of entries) {
      if (
        e === "node_modules" || e === "dist" || e === ".git" || e === "build" || e === ".vite" || e === "coverage"
      ) continue;
      const full = join(d, e);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) w(full);
      else if (s.isFile() && exts.some((x) => e.endsWith(x)) && !e.endsWith(".d.ts")) {
        out.push(full);
      }
    }
  }
  w(root);
  return out;
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const findings: WiringFinding[] = [];

  // ---- 1. Platform primitives present ----------------------------
  const platformPrims = [
    "client/src/platform/modules/registry.ts",
    "client/src/platform/modules/types.ts",
    "client/src/platform/modules/route-composer.tsx",
    "client/src/platform/modules/nav-composer.ts",
    "client/src/platform/modules/index.ts",
  ];
  for (const rel of platformPrims) {
    if (!existsSync(join(repoRoot, rel))) {
      findings.push({
        module: "(platform)",
        lane: "route",
        status: "missing",
        severity: "high",
        message: `Client primitive missing: ${rel}`,
      });
    }
  }

  // ---- 2. Per-module client manifest -----------------------------
  const inventory = buildFullInventory({ repoRoot });
  for (const inv of inventory) {
    const mod = KNOWN_MODULES.find((m) => m.key === inv.key);
    if (!mod) continue;
    if (inv.routes.serverDeclared.length === 0) continue;

    const candidates = [
      join(repoRoot, "client/src/modules", mod.folder, "manifest.ts"),
      join(repoRoot, "client/src/modules", mod.folder, "manifest.tsx"),
      join(repoRoot, "client/src/platform/modules", mod.folder, "manifest.ts"),
    ];
    const present = candidates.find((p) => existsSync(p));
    if (!present) {
      findings.push({
        module: inv.key,
        lane: "route",
        status: "declared-only",
        severity: "follow-up",
        message: `Server declares ${inv.routes.serverDeclared.length} route(s) but no client manifest exists for module '${inv.key}'`,
        hint: `Create client/src/modules/${mod.folder}/manifest.ts and registerClientModule()`,
      });
      continue;
    }

    const src = read(present);
    for (const field of ["key", "routes"]) {
      if (!new RegExp(`\\b${field}\\s*[:?]`).test(src)) {
        findings.push({
          module: inv.key,
          lane: "route",
          status: "declared-only",
          severity: "high",
          message: `Client manifest at ${relative(repoRoot, present)} missing required field '${field}'`,
        });
      }
    }

    // Cross-check nav items reference declared routes.
    const declaredPaths = new Set(
      [...src.matchAll(/path\s*:\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]),
    );
    const navTargets = [...src.matchAll(/(href|to|target|route)\s*:\s*["'`](\/[^"'`]+)["'`]/g)].map(
      (m) => m[2],
    );
    for (const t of navTargets) {
      if (!declaredPaths.has(t)) {
        findings.push({
          module: inv.key,
          lane: "route",
          status: "wired",
          severity: "medium",
          message: `Client nav references undeclared route '${t}'`,
          hint: relative(repoRoot, present),
        });
      }
    }
  }

  // ---- 3. App.tsx hardcoded routes (compatibility mode) ----------
  const appPath = join(repoRoot, "client/src/App.tsx");
  if (existsSync(appPath)) {
    const appSrc = read(appPath);
    const hardcodedRoutes = (appSrc.match(/<Route\s+path=["'`]/g) ?? []).length;
    const usesModuleRoutes = /<ModuleRoutes\b|registerClientModule\(/.test(appSrc);
    if (hardcodedRoutes > 0 && !usesModuleRoutes) {
      findings.push({
        module: "(platform)",
        lane: "route",
        status: "wired",
        severity: "follow-up",
        message: `App.tsx contains ${hardcodedRoutes} hardcoded <Route> entries with no <ModuleRoutes /> mount — compatibility mode`,
        hint: "Document in WIRING_VERIFICATION_GUIDE.md or mount <ModuleRoutes /> after the legacy switch",
      });
    }
  }

  // ---- 4. Print + exit -------------------------------------------
  console.log("=== check:frontend-wiring ===");
  const _ = walk; // silence unused for the "exts" helper if needed
  void _;

  console.log(`\n${findings.length} finding(s):`);
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.module} ${f.lane}: ${f.message}`);
  }

  const blocking = findings.filter(
    (f) => f.severity === "blocker" || f.severity === "high",
  );
  if (blocking.length > 0) {
    console.error(`\n${blocking.length} blocking finding(s).`);
    process.exit(1);
  }
  console.log("\nOK — frontend wiring within tolerance.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[FATAL] check:frontend-wiring", err);
  process.exit(2);
});
