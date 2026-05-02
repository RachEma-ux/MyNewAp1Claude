/**
 * Data Analysis — Frontend Module Manifest (capsule shape).
 *
 * Data Analysis is the second Module Client Capsule (after
 * Communication, PR #59). The manifest:
 *   - declares the canonical subtree (`/data-analysis`)
 *   - points at `mod.tsx` as the capsule entrypoint
 *   - lists every canonical path under `routeInventory` so AWI and
 *     `check:module-route-inventory` know the full surface
 *
 * Subdomains owned by Data Analysis:
 *   - GraphRAG               → /data-analysis/graphrag
 *   - Data Acquisition       → /data-analysis/data-acquisition[/...]
 *   - Data Warehouse         → /data-analysis/data-warehouse
 *
 * KGRA Agent is intentionally absent. KGRA Agent is a separate
 * RTLM with its own client manifest at
 * `client/src/modules/kgra-agent/manifest.ts` that owns
 * `/data-analysis/kgra-agent` directly. The route lives under the
 * `/data-analysis/*` subtree by historical accident — it is not a
 * Data Analysis subdomain. Migrating Data Analysis to a capsule
 * does not absorb KGRA: App.tsx and the KGRA manifest continue to
 * mount `/data-analysis/kgra-agent` themselves. A future PR will
 * give KGRA its own baseRoute (or its own capsule).
 *
 * App.tsx no longer mounts Data Analysis pages directly. The
 * capsule renders via `<ModuleRoutes />` once `client.ts` registers
 * this manifest.
 */

import { lazy } from "react";

import type { ClientModuleManifest } from "@/platform/modules/types";

const DataAnalysisCapsule = lazy(() => import("./mod"));

export const dataAnalysisClientManifest: ClientModuleManifest = {
  key: "dataAnalysis",
  name: "Data Analysis",

  /* ---- Capsule fields (Phase-1+) ---- */
  baseRoute: "/data-analysis",
  capsuleEntrypoint: DataAnalysisCapsule,
  layoutMode: "inside-main-layout",
  routeInventory: [
    "/data-analysis",
    "/data-analysis/graphrag",
    "/data-analysis/data-acquisition",
    "/data-analysis/data-acquisition/sources",
    "/data-analysis/data-acquisition/runs",
    "/data-analysis/data-acquisition/items",
    "/data-analysis/data-acquisition/classification",
    "/data-analysis/data-acquisition/routing",
    "/data-analysis/data-acquisition/processing",
    "/data-analysis/data-acquisition/document-intelligence",
    "/data-analysis/data-acquisition/canonical-records",
    "/data-analysis/data-acquisition/outputs",
    "/data-analysis/data-acquisition/settings",
    "/data-analysis/data-warehouse",
  ],
  // No legacy paths to redirect — Data Analysis was already
  // canonically rooted at `/data-analysis/*` before the capsule
  // migration.
  compatibilityRoutes: [],
  deprecatedRoutes: [],

  /* ---- Legacy field — empty for capsule modules ---- */
  // The composer ignores `routes[]` when `baseRoute + capsuleEntrypoint`
  // are present; we leave it empty to match the capsule shape.
  routes: [],

  navigation: [
    { group: "dataAnalysis", label: "Data Analysis", order: 5 },
  ],
  requiredPermissions: ["dataAnalysis.read"],
};
