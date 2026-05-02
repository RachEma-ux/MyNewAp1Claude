/**
 * Organization Management — Capsule entrypoint (mod.tsx).
 *
 * Mounted by `<ModuleRoutes />` for both `/om` and `/om/:item`.
 *
 * OM has no in-capsule Shell. `OMTopLevelPage` is a thin dispatcher
 * that reads `useParams().item` and renders one of:
 *   - Portfolio (default / `portfolio`)
 *   - Control Panel (`control-panel`)
 *   - Wizard (`wizard`)
 *   - List (`list`)
 *   - Settings (`settings`)
 *   - Templates (`templates`)
 *
 * The capsule wraps that dispatcher in a Wouter `<Switch>` so both
 * `/om` and `/om/:item` mount it.
 */

import { Suspense, lazy } from "react";
import { Route, Switch } from "wouter";
import { Loader2 } from "lucide-react";

const OMTopLevelPage = lazy(() => import("./pages/OMTopLevelPage"));

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function OMCapsule() {
  return (
    <Suspense fallback={<Fallback />}>
      <Switch>
        <Route path="/om/:item">
          <OMTopLevelPage />
        </Route>
        <Route path="/om">
          <OMTopLevelPage />
        </Route>
      </Switch>
    </Suspense>
  );
}
