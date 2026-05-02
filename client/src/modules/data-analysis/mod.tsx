/**
 * Data Analysis — Capsule entrypoint (mod.tsx).
 *
 * Mounted by `<ModuleRoutes />` for both `/data-analysis` and
 * `/data-analysis/:rest*`. Owns internal routing inside the Data
 * Analysis subtree; the platform `<Switch>` in App.tsx never
 * sees these inner paths (except for the KGRA Agent route, which
 * is owned by the KGRA RTLM and remains mounted directly).
 *
 * Subdomains owned here:
 *   - GraphRAG               → /data-analysis/graphrag
 *   - Data Acquisition       → /data-analysis/data-acquisition[/...]
 *   - Data Warehouse         → /data-analysis/data-warehouse
 *
 * Constraints:
 *   - Does NOT import `MainLayout` — the platform decides outer
 *     chrome based on the manifest's `layoutMode`.
 *   - Does NOT import private code from another module.
 *   - Does NOT call `trpc.<other-rtlm>.*`.
 *   - Does NOT mount KGRA Agent — that's a separate RTLM. Visiting
 *     `/data-analysis/kgra-agent` resolves through the KGRA
 *     manifest, not through this capsule.
 *
 * The routes are sourced from `./routes` so that
 * `check:module-route-inventory` can match the manifest's
 * `routeInventory` against the actual runtime mounts.
 */

import { Suspense } from "react";
import { Route, Switch } from "wouter";

import { DataAnalysisShell } from "./components/DataAnalysisShell";
import { dataAnalysisRoutes } from "./routes";

export default function DataAnalysisCapsule() {
  return (
    <DataAnalysisShell>
      <Suspense fallback={null}>
        <Switch>
          {dataAnalysisRoutes.map((r) => {
            const Component = r.component as any;
            return (
              <Route key={r.path} path={r.path}>
                <Component />
              </Route>
            );
          })}
          <Route>
            {/* Unknown sub-path under /data-analysis — render a
                small fallback rather than NotFound so deep links
                typo'd inside the module land somewhere useful. */}
            <DataAnalysisFallback />
          </Route>
        </Switch>
      </Suspense>
    </DataAnalysisShell>
  );
}

function DataAnalysisFallback() {
  return (
    <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
      Data Analysis: that page doesn't exist. Try{" "}
      <a href="/data-analysis/graphrag" className="underline">
        GraphRAG
      </a>
      ,{" "}
      <a href="/data-analysis/data-acquisition" className="underline">
        Data Acquisition
      </a>
      , or{" "}
      <a href="/data-analysis/data-warehouse" className="underline">
        Data Warehouse
      </a>
      .
    </div>
  );
}
