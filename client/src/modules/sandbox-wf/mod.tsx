/**
 * Sandbox WF — Capsule entrypoint (mod.tsx).
 *
 * Wouter `<Switch>`: the deep-link routes (`/new` and `/:id`)
 * dispatch to `WFCreationShell` (the workflow editor); bare
 * `/automation/sandbox-wf` falls through to `SandboxWFPage` (the
 * workflow list). This mirrors the App.tsx mount shape that
 * existed before the migration.
 */

import { Suspense, lazy } from "react";
import { Switch, Route } from "wouter";
import { Loader2 } from "lucide-react";

const SandboxWFPage = lazy(() => import("./pages/SandboxWFPage"));
const WFCreationShell = lazy(() => import("./pages/WFCreationShell"));

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function SandboxWfCapsule() {
  return (
    <Suspense fallback={<Fallback />}>
      <Switch>
        <Route path="/automation/sandbox-wf/new" component={WFCreationShell} />
        <Route path="/automation/sandbox-wf/:id" component={WFCreationShell} />
        <Route path="/automation/sandbox-wf" component={SandboxWFPage} />
      </Switch>
    </Suspense>
  );
}
