#!/usr/bin/env tsx
/**
 * check:app-route-ownership
 *
 * Enforces App.tsx scope:
 *   - For migrated RTLMs, App.tsx must NOT import private pages of
 *     the module and must NOT mount canonical module routes.
 *   - App.tsx may keep platform-core routes.
 *   - App.tsx may keep compatibility redirects (Route → Redirect).
 *   - No `mod.tsx` or page under client/src/modules/<migrated>/
 *     may import MainLayout.
 *
 * Phase-0 behavior: with no migrated modules, this script reports
 * the current ownership state and only fails on outright structural
 * issues (missing App.tsx).
 */

import { existsSync, readFileSync } from "fs";
import { join, relative } from "path";

import {
  isMigrated,
  PLATFORM_CORE_PREFIXES,
  RTLM_FOLDER_MAP,
  RTLM_LIST,
  type RtlmKey,
} from "./module-tools/migration-state";
import { readAllManifests } from "./module-tools/manifest-reader";
import { extractAppRoutes } from "./module-tools/route-inventory";
import { isBaseRouteMatch, normalizePath } from "./module-tools/route-parser";
import { walkSourceFiles } from "./module-tools/walk";
import { scanFileForBoundaries } from "./module-tools/boundary-rules";

interface Finding {
  severity: "fail" | "warn";
  msg: string;
}

function main() {
  const repoRoot = process.cwd();
  const appPath = join(repoRoot, "client", "src", "App.tsx");
  if (!existsSync(appPath)) {
    console.error("[FAIL] client/src/App.tsx not found");
    process.exit(1);
  }
  const appSrc = readFileSync(appPath, "utf8");
  const appRoutes = extractAppRoutes(appSrc);

  // Build a path → owners map from every module's manifest. Used
  // below to disambiguate App.tsx mounts that fall under a migrated
  // module's baseRoute by URL prefix but are actually claimed by
  // another module's manifest (e.g. KGRA Agent's
  // `/data-analysis/kgra-agent` lives under Data Analysis's
  // `/data-analysis` baseRoute by historical accident, but KGRA
  // Agent owns the route via its own client manifest — Data
  // Analysis is not responsible for it).
  const manifests = readAllManifests(repoRoot);
  const claimedBy = new Map<string, Set<string>>();
  for (const m of manifests) {
    if (!m.key) continue;
    const claimed = new Set<string>();
    for (const r of m.routes) claimed.add(normalizePath(r.path));
    for (const p of m.routeInventory) claimed.add(normalizePath(p));
    for (const p of claimed) {
      let s = claimedBy.get(p);
      if (!s) claimedBy.set(p, (s = new Set()));
      s.add(m.key);
    }
  }

  const findings: Finding[] = [];

  // For each migrated module: hardcoded canonical routes are FAIL.
  // The baseRoute test uses the manifest's declared `baseRoute` when
  // present, falling back to `/<folder>` otherwise. This matters when
  // a module's storage folder differs from its URL subtree — e.g.
  // PM Central lives at `client/src/modules/pm-central/` (folder
  // `pm-central`) but its manifest declares `baseRoute: "/pm"`. In
  // that case the legacy `/pm-central/*` paths are not the migrated
  // module's canonical surface — they are a separate non-RTLM legacy
  // shell — and should not be flagged as canonical for `pmCentral`.
  const baseRouteByKey = new Map<string, string>();
  for (const m of manifests) {
    if (!m.key) continue;
    if (m.baseRoute) baseRouteByKey.set(m.key, normalizePath(m.baseRoute));
  }
  for (const key of RTLM_LIST) {
    const folder = RTLM_FOLDER_MAP[key as RtlmKey];
    if (!isMigrated(key)) continue;
    const baseRoute = baseRouteByKey.get(key) ?? `/${folder}`;
    for (const r of appRoutes) {
      const p = normalizePath(r.path);
      // Skip platform-core
      if (PLATFORM_CORE_PREFIXES.some((pc) => isBaseRouteMatch(pc, p))) continue;
      // Skip pure redirects
      if (r.redirectTo) continue;
      if (!isBaseRouteMatch(baseRoute, p)) continue;
      // The path falls under the migrated module's URL subtree by
      // prefix — but if a different module's manifest explicitly
      // claims this exact path, it is not this migrated module's
      // responsibility. (`check:module-routes-conflict` separately
      // enforces that two modules don't both claim the same path.)
      const owners = claimedBy.get(p);
      if (owners && [...owners].some((o) => o !== key)) continue;
      findings.push({
        severity: "fail",
        msg: `App.tsx hardcodes canonical route ${p} for migrated module ${key} (baseRoute ${baseRoute})`,
      });
    }
    // Private page imports for migrated modules.
    const privateImportRe = new RegExp(
      `import[^"'\`]*?from\\s+["'\`]@/(?:pages/${folder}|modules/${folder}/(?:pages|components|hooks|api))[^"'\`]*?["'\`]`,
      "g",
    );
    for (const m of appSrc.matchAll(privateImportRe)) {
      findings.push({
        severity: "fail",
        msg: `App.tsx privately imports ${m[0]} from migrated module ${key}`,
      });
    }
  }

  // MainLayout imports under any module folder are always FAIL — the
  // platform owns layout, modules don't. (Reported as baseline for
  // unmigrated modules so we can see drift.)
  for (const file of walkSourceFiles(
    join(repoRoot, "client", "src", "modules"),
  )) {
    const src = readFileSync(file, "utf8");
    const findings2 = scanFileForBoundaries(relative(repoRoot, file), src);
    for (const f of findings2) {
      if (f.kind === "main-layout-import") {
        const sev: Finding["severity"] =
          f.selfModule && isMigrated(f.selfModule) ? "fail" : "warn";
        findings.push({
          severity: sev,
          msg: `${f.file}: imports MainLayout (modules cannot own layout)`,
        });
      }
    }
  }

  /* ----- summary ----- */
  console.log("App Route Ownership");
  console.log("===================");
  console.log(`App.tsx routes:        ${appRoutes.length}`);
  console.log(
    `App.tsx redirects:     ${appRoutes.filter((r) => r.redirectTo).length}`,
  );
  console.log("");

  const fails = findings.filter((f) => f.severity === "fail");
  const warns = findings.filter((f) => f.severity === "warn");
  for (const f of fails) console.log(`  [FAIL] ${f.msg}`);
  for (const w of warns) console.log(`  [warn] ${w.msg}`);
  console.log("");
  console.log(`Failures: ${fails.length}`);
  console.log(`Baseline warnings: ${warns.length}`);
  if (fails.length > 0) process.exit(1);
  console.log("OK — App.tsx ownership within tolerance.");
  process.exit(0);
}

main();
