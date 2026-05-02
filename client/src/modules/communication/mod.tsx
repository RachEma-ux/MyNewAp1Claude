/**
 * Communication — Capsule entrypoint (mod.tsx).
 *
 * Mounted by `<ModuleRoutes />` for both `/communication` and
 * `/communication/:rest*`. Owns internal routing inside the
 * Communication subtree; the platform `<Switch>` in App.tsx never
 * sees these inner paths.
 *
 * Constraints:
 *   - Does NOT import `MainLayout` — the platform decides outer
 *     chrome based on the manifest's `layoutMode`.
 *   - Does NOT import private code from another module.
 *   - Does NOT call `trpc.<other-rtlm>.*`.
 *
 * The routes are sourced from `./routes` so that
 * `check:module-route-inventory` can match the manifest's
 * `routeInventory` against the actual runtime mounts.
 */

import { Suspense } from "react";
import { Route, Switch } from "wouter";

import { CommunicationShell } from "./components/CommunicationShell";
import { communicationRoutes } from "./routes";

export default function CommunicationCapsule() {
  return (
    <CommunicationShell>
      <Suspense fallback={null}>
        <Switch>
          {communicationRoutes.map((r) => {
            const Component = r.component as any;
            return (
              <Route key={r.path} path={r.path}>
                <Component />
              </Route>
            );
          })}
          <Route>
            {/* Unknown sub-path under /communication — render the
                dashboard rather than NotFound so deep links typo'd
                inside the module land somewhere useful. */}
            <CommunicationFallback />
          </Route>
        </Switch>
      </Suspense>
    </CommunicationShell>
  );
}

function CommunicationFallback() {
  return (
    <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
      Communication: that page doesn't exist. Try{" "}
      <a href="/communication" className="underline">
        the overview
      </a>
      .
    </div>
  );
}
