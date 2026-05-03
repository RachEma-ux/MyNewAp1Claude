/**
 * OpenRouter — Capsule entrypoint (mod.tsx).
 *
 * Mounted by `<ModuleRoutes />` for both `/openrouter` and
 * `/openrouter/:rest*`. The Shell does its own internal view dispatch
 * off `useLocation()`, so mod.tsx renders it directly inside the
 * standard `flex -mx-6 -mt-6 / calc(100vh - 4rem)` chrome that the
 * legacy `OpenRouterShellPage.tsx` wrapper used to carry.
 */

import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

const OpenRouterShell = lazy(() => import("./components/OpenRouterShell"));

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function OpenRouterCapsule() {
  return (
    <div
      className="flex h-full w-full overflow-hidden min-w-0 max-w-full"
    >
      <Suspense fallback={<Fallback />}>
        <OpenRouterShell />
      </Suspense>
    </div>
  );
}
