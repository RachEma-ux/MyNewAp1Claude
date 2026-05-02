/**
 * KGRA Agent — Capsule entrypoint (mod.tsx).
 *
 * Mounted by `<ModuleRoutes />` for `/data-analysis/kgra-agent`.
 * KGRAAgentPage hosts the OmniRAG-cloned UI directly (loads HTML +
 * CSS + JS from `/kgra-ui` into a container ref); no further
 * internal routing needed, so mod.tsx renders the page directly.
 */

import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

const KGRAAgentPage = lazy(() => import("./pages/KGRAAgentPage"));

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function KgraAgentCapsule() {
  return (
    <Suspense fallback={<Fallback />}>
      <KGRAAgentPage />
    </Suspense>
  );
}
