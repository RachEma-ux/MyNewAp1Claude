/**
 * PM Central — Capsule entrypoint (mod.tsx).
 *
 * Mounted by `<ModuleRoutes />` for both `/pm` and
 * `/pm/:rest*`. Owns internal routing inside the PM Central
 * canonical subtree; the platform `<Switch>` in App.tsx never sees
 * these inner paths.
 *
 * Subdomains owned here:
 *   - Dashboard       → /pm
 *   - Projects        → /pm/projects, /pm/projects/:id
 *   - Tasks           → /pm/tasks
 *   - Milestones      → /pm/milestones
 *   - Risks           → /pm/risks
 *   - Issues          → /pm/issues
 *   - Decisions       → /pm/decisions
 *   - Handoffs        → /pm/handoffs
 *   - Settings        → /pm/settings
 *
 * Constraints:
 *   - Does NOT import `MainLayout` — the platform decides outer
 *     chrome based on the manifest's `layoutMode`.
 *   - Does NOT import private code from another module.
 *   - Does NOT call `trpc.<other-rtlm>.*`. PS → PM Central remains
 *     a backend handoff; the frontend never reaches across.
 *
 * The legacy `/pm-central/*` shell (PMCentralShellPage and friends)
 * is a SEPARATE non-RTLM surface and is not mounted by this
 * capsule. Those routes continue to be served directly from
 * App.tsx.
 *
 * The routes are sourced from `./routes` so that
 * `check:module-route-inventory` can match the manifest's
 * `routeInventory` against the actual runtime mounts.
 */

import { Suspense } from "react";
import { Route, Switch } from "wouter";

import { PMCentralShell } from "./components/PMCentralShell";
import { pmCentralRoutes } from "./routes";

export default function PMCentralCapsule() {
  return (
    <PMCentralShell>
      <Suspense fallback={null}>
        <Switch>
          {pmCentralRoutes.map((r) => {
            const Component = r.component as any;
            return (
              <Route key={r.path} path={r.path}>
                <Component />
              </Route>
            );
          })}
          <Route>
            {/* Unknown sub-path under /pm — render a small fallback
                rather than NotFound so deep links typo'd inside the
                module land somewhere useful. */}
            <PMCentralFallback />
          </Route>
        </Switch>
      </Suspense>
    </PMCentralShell>
  );
}

function PMCentralFallback() {
  return (
    <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
      PM Central: that page doesn't exist. Try{" "}
      <a href="/pm" className="underline">the dashboard</a>,{" "}
      <a href="/pm/projects" className="underline">projects</a>, or{" "}
      <a href="/pm/handoffs" className="underline">handoffs</a>.
    </div>
  );
}
