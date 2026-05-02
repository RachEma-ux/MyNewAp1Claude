#!/usr/bin/env tsx
/**
 * generate-route-ownership-map
 *
 * Builds a fresh `RouteInventory` and writes:
 *   - docs/architecture/frontend/ROUTE_OWNERSHIP_MAP.md
 *   - docs/architecture/frontend/MODULE_CLIENT_CAPSULE_BASELINE.md
 *
 * Includes baseline-only signals (cross-module trpc usage, MainLayout
 * imports under client/src/modules/, duplicate paths) so the
 * documents form a single auditable snapshot.
 *
 * Exits 0 unless writing the docs fails. Uses `process.exit(0)` so
 * `pnpm check:architecture:full` can include the generator without
 * worrying about hanging side-effects.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, relative } from "path";

import { buildRouteInventory } from "./module-tools/route-inventory";
import {
  renderBaselineDoc,
  renderOwnershipMap,
  type BaselineFindings,
} from "./module-tools/ownership-map";
import { walkSourceFiles } from "./module-tools/walk";
import { scanFileForBoundaries } from "./module-tools/boundary-rules";
import { normalizePath } from "./module-tools/route-parser";

function main() {
  const repoRoot = process.cwd();
  const inv = buildRouteInventory(repoRoot);

  /* ----- duplicate path detection (path appears in >1 source) ----- */
  const sourcesByPath = new Map<string, Set<string>>();
  for (const r of inv.appRoutes) {
    push(sourcesByPath, normalizePath(r.path), "App.tsx");
  }
  for (const m of inv.manifests) {
    for (const r of m.routes) {
      push(sourcesByPath, normalizePath(r.path), `manifest:${m.folder}`);
    }
    for (const p of m.routeInventory) {
      push(sourcesByPath, normalizePath(p), `routeInventory:${m.folder}`);
    }
    for (const p of m.routesFileEntries) {
      push(sourcesByPath, normalizePath(p), `routes.tsx:${m.folder}`);
    }
  }
  const duplicatePaths: BaselineFindings["duplicatePaths"] = [];
  for (const [path, sources] of sourcesByPath) {
    if (sources.size > 1) {
      duplicatePaths.push({ path, sources: [...sources].sort() });
    }
  }
  duplicatePaths.sort((a, b) => a.path.localeCompare(b.path));

  /* ----- cross-module API + MainLayout scan under modules/ ----- */
  const crossModuleApi: BaselineFindings["crossModuleApi"] = [];
  const mainLayoutImports: string[] = [];
  for (const file of walkSourceFiles(
    join(repoRoot, "client", "src", "modules"),
  )) {
    const src = readFileSync(file, "utf8");
    const findings = scanFileForBoundaries(relative(repoRoot, file), src);
    for (const f of findings) {
      if (f.kind === "cross-module-trpc") {
        crossModuleApi.push({
          file: f.file,
          callsite: extractTrpcCall(f.evidence),
          foreignModule: f.foreignModule ?? "?",
        });
      } else if (f.kind === "main-layout-import") {
        mainLayoutImports.push(f.file);
      }
    }
  }
  crossModuleApi.sort((a, b) =>
    a.file === b.file ? a.callsite.localeCompare(b.callsite) : a.file.localeCompare(b.file),
  );
  mainLayoutImports.sort();

  const baseline: BaselineFindings = {
    duplicatePaths,
    crossModuleApi,
    mainLayoutImports,
  };

  /* ----- write docs ----- */
  const outDir = join(repoRoot, "docs", "architecture", "frontend");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const mapPath = join(outDir, "ROUTE_OWNERSHIP_MAP.md");
  const baselinePath = join(outDir, "MODULE_CLIENT_CAPSULE_BASELINE.md");

  writeFileSync(mapPath, renderOwnershipMap(inv), "utf8");
  writeFileSync(baselinePath, renderBaselineDoc(inv, baseline), "utf8");

  /* ----- summary ----- */
  console.log("Route Ownership Map");
  console.log("===================");
  console.log(`App routes:           ${inv.appRoutes.length}`);
  console.log(`Compatibility redirs: ${inv.appRedirects.size}`);
  console.log(`Manifests scanned:    ${inv.manifests.length}`);
  console.log(`Total path rows:      ${inv.rows.length}`);
  console.log(`Duplicate paths:      ${duplicatePaths.length}`);
  console.log(`Cross-module trpc:    ${crossModuleApi.length}`);
  console.log(`MainLayout in modules:${mainLayoutImports.length}`);
  console.log("");
  console.log("Wrote:");
  console.log(`  ${relative(repoRoot, mapPath)}`);
  console.log(`  ${relative(repoRoot, baselinePath)}`);
  process.exit(0);
}

function push<K, V>(m: Map<K, Set<V>>, k: K, v: V) {
  let s = m.get(k);
  if (!s) m.set(k, (s = new Set()));
  s.add(v);
}

function extractTrpcCall(line: string): string {
  const m = line.match(/trpc\s*\.[A-Za-z_][\w.]*(?:\(\))?/);
  return m ? m[0] : line.slice(0, 80);
}

main();
