/**
 * PSM — Capsule entrypoint (mod.tsx).
 *
 * Mounted by `<ModuleRoutes />` for both `/psm` and `/psm/:rest*`.
 *
 * PSM uses two layout modes:
 *   - The shell-managed surfaces (dashboard, library, selector, cases
 *     list, ai-catalog, admin, analytics) render inside `PSMShell`,
 *     which drives an S1 sidebar and chooses a page off
 *     `useLocation()`.
 *   - Three deep-link routes historically mounted without the shell.
 *     Preserve that UX: dispatch `/psm/cases/:id`, `/psm/methods/:id`,
 *     and `/psm/runs/:id` directly to their dedicated pages before
 *     falling through to the shell.
 */

import { Suspense, lazy } from "react";
import { Route, Switch } from "wouter";
import { Loader2 } from "lucide-react";

import PSMShell from "./components/PSMShell";

const PSMCaseDetailPage = lazy(() => import("./pages/PSMCaseDetailPage"));
const PSMMethodDetailPage = lazy(() => import("./pages/PSMMethodDetailPage"));
const PSMRunPage = lazy(() => import("./pages/PSMRunPage"));

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function PSMCapsule() {
  return (
    <Suspense fallback={<Fallback />}>
      <Switch>
        <Route path="/psm/cases/:id">
          <PSMCaseDetailPage />
        </Route>
        <Route path="/psm/methods/:id">
          <PSMMethodDetailPage />
        </Route>
        <Route path="/psm/runs/:id">
          <PSMRunPage />
        </Route>
        <Route>
          <PSMShell />
        </Route>
      </Switch>
    </Suspense>
  );
}
