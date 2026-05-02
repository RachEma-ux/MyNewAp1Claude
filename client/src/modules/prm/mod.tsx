/**
 * PRM — Capsule entrypoint (mod.tsx).
 *
 * Mounted by `<ModuleRoutes />` for both `/prm` and `/prm/:rest*`.
 *
 * PRM uses two layout modes:
 *   - The shell-managed surfaces (dashboard, new case, cases list,
 *     methods, playbooks, catalog, ai-catalog, control-panel) render
 *     inside `PRMShell`, which drives an S1 sidebar and chooses a
 *     page off `useLocation()`.
 *   - The case workspace deep link (`/prm/cases/:id`) historically
 *     mounted without the shell. Preserve that UX: dispatch it to
 *     `PRMCaseWorkspacePage` directly, before falling through to the
 *     shell.
 */

import { Suspense, lazy } from "react";
import { Route, Switch } from "wouter";
import { Loader2 } from "lucide-react";

import PRMShell from "./components/PRMShell";

const PRMCaseWorkspacePage = lazy(() => import("./pages/PRMCaseWorkspacePage"));

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function PRMCapsule() {
  return (
    <Suspense fallback={<Fallback />}>
      <Switch>
        <Route path="/prm/cases/:id">
          <PRMCaseWorkspacePage />
        </Route>
        <Route>
          <PRMShell />
        </Route>
      </Switch>
    </Suspense>
  );
}
