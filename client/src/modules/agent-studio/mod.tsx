/**
 * Agent Studio — Capsule entrypoint (mod.tsx).
 *
 * Mounted by `<ModuleRoutes />` for both `/agent-studio` and
 * `/agent-studio/:rest*`. The Shell does its own internal view
 * dispatch off `useLocation()` (regex-parses `/agent-studio/:id`,
 * `/:id/:section`, `/:id/runs/:runId`, `/:id/versions/compare`,
 * plus the global home/new/templates/import/catalog/marketplace/
 * mcp-manager paths), so mod.tsx renders it directly inside the
 * standard `flex -mx-6 -mt-6 / calc(100vh - 4rem)` chrome that the
 * legacy `AgentStudioShellPage.tsx` wrapper used to carry.
 */

import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

const AgentStudioShell = lazy(() => import("./components/AgentStudioShell"));

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function AgentStudioCapsule() {
  return (
    <div
      className="flex -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 overflow-hidden h-[calc(100dvh-4rem)] min-w-0 max-w-full"
    >
      <Suspense fallback={<Fallback />}>
        <AgentStudioShell />
      </Suspense>
    </div>
  );
}
