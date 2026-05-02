/**
 * Culture & Values — Capsule entrypoint (mod.tsx).
 *
 * Mounted by `<ModuleRoutes />` for both `/cv` and `/cv/:item`.
 *
 * CV has no in-capsule Shell. `CVTopLevelPage` is a thin dispatcher
 * that reads `useParams().item` and renders Portfolio (default),
 * Wizard, or Settings.
 */

import { Suspense, lazy } from "react";
import { Route, Switch } from "wouter";
import { Loader2 } from "lucide-react";

const CVTopLevelPage = lazy(() => import("./pages/CVTopLevelPage"));

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function CVCapsule() {
  return (
    <Suspense fallback={<Fallback />}>
      <Switch>
        <Route path="/cv/:item">
          <CVTopLevelPage />
        </Route>
        <Route path="/cv">
          <CVTopLevelPage />
        </Route>
      </Switch>
    </Suspense>
  );
}
