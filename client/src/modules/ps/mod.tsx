/**
 * Projects System — Capsule entrypoint (mod.tsx).
 *
 * Mounted by `<ModuleRoutes />` for both `/ps` and `/ps/:rest*`. The
 * platform `<Switch>` in App.tsx never sees the inner paths.
 *
 * PS uses two layout modes:
 *   - Most surfaces render inside `PSShell` (catalog, ideation list,
 *     control-panel, wizard, list, ai-catalog). The shell drives an
 *     S1 sidebar and chooses a page off `useLocation()`.
 *   - The dynamic ideation routes (`/ps/ideation/:id` and
 *     `/ps/ideation/:id/convert`) historically mounted without the
 *     shell. Preserve that UX: dispatch them to the dedicated pages
 *     directly, before falling through to the shell.
 *
 * Surfaces owned here:
 *   - Catalog          → /ps, /ps/catalog
 *   - Ideation         → /ps/ideation
 *   - Ideation Detail  → /ps/ideation/:id
 *   - Ideation Convert → /ps/ideation/:id/convert
 *   - Control Panel    → /ps/control-panel
 *   - Wizard           → /ps/wizard
 *   - List             → /ps/list
 *   - AI Catalog       → /ps/ai-catalog
 *
 * Constraints:
 *   - Does NOT import `MainLayout` — the platform decides outer
 *     chrome based on the manifest's `layoutMode`.
 *   - Does NOT import private code from another module.
 *   - Does NOT call `trpc.<other-rtlm>.*`. PS → PM Central is a
 *     backend handoff; the frontend never reaches across.
 */

import { Suspense, lazy } from "react";
import { Route, Switch } from "wouter";
import { Loader2 } from "lucide-react";

import PSShell from "./components/PSShell";

const PSIdeationDetailPage = lazy(() =>
  import("./pages/PSIdeationDetailPage").then((m) => ({
    default: m.PSIdeationDetailPage,
  })),
);
const PSIdeationConvertPage = lazy(() =>
  import("./pages/PSIdeationConvertPage").then((m) => ({
    default: m.PSIdeationConvertPage,
  })),
);

const Fallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
  </div>
);

export default function PSCapsule() {
  return (
    <Suspense fallback={<Fallback />}>
      <Switch>
        {/* Specific dynamic routes render WITHOUT PSShell — they were
            mounted as standalone routes before the capsule and their
            full-page layout assumes that placement. */}
        <Route path="/ps/ideation/:id/convert">
          <PSIdeationConvertPage />
        </Route>
        <Route path="/ps/ideation/:id">
          <PSIdeationDetailPage />
        </Route>
        {/* Everything else (catalog, ideation list, control-panel,
            wizard, list, ai-catalog, and bare /ps) goes through
            PSShell, which owns its own internal view switch off
            useLocation. */}
        <Route>
          <div
            className="flex -mx-6 -mt-6 overflow-hidden"
            style={{ height: "calc(100vh - 4rem)" }}
          >
            <PSShell />
          </div>
        </Route>
      </Switch>
    </Suspense>
  );
}
