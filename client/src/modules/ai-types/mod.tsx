/**
 * AI Types — Capsule entrypoint (mod.tsx).
 *
 * Mounted by `<ModuleRoutes />` for both `/ai-types` and
 * `/ai-types/:rest*`. The Shell does its own internal view dispatch
 * off `useLocation()`, so mod.tsx just renders it as the
 * fall-through.
 */

import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

const AITypesShell = lazy(() => import("./pages/AITypesShell"));

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function AITypesCapsule() {
  return (
    <Suspense fallback={<Fallback />}>
      <AITypesShell />
    </Suspense>
  );
}
