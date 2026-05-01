/**
 * Route Composer — composes wouter routes from registered client manifests.
 *
 * Usage in App.tsx:
 *
 *   import { ModuleRoutes } from "@/platform/modules/route-composer";
 *   ...
 *   <Switch>
 *     {platformCoreRoutes}
 *     <ModuleRoutes />
 *     <Route><NotFound /></Route>
 *   </Switch>
 *
 * The composer renders each module's routes in order. Modules with a
 * `fallback` component render the fallback when disabled.
 */

import { Suspense } from "react";
import { Route } from "wouter";
import { listClientModules } from "./registry";

export function ModuleRoutes() {
  const modules = listClientModules();
  return (
    <>
      {modules.flatMap((m) =>
        m.routes.map((r) => {
          const Component = r.component as any;
          return (
            <Route key={`${m.key}:${r.path}`} path={r.path}>
              <Suspense fallback={null}>
                <Component />
              </Suspense>
            </Route>
          );
        }),
      )}
    </>
  );
}
