/**
 * PMCentralShell.
 *
 * Module-local frame around every PM Central RTLM page. Provides a
 * subdomain tab bar (Dashboard, Projects, Tasks, Milestones, Risks,
 * Issues, Decisions, Handoffs, Settings) and renders the active
 * subdomain's page below.
 *
 * Constraints (enforced by `check:app-route-ownership` and
 * `check:module-api-boundaries`):
 *   - DOES NOT import MainLayout — this component is rendered
 *     *inside* the platform's MainLayout via the manifest's
 *     `layoutMode: "inside-main-layout"`.
 *   - DOES NOT call another module's backend (`trpc.<other>.*`).
 *   - DOES NOT reach into another module's private internals.
 *   - The PS handoff boundary is preserved: PM Central shows its
 *     own /pm/handoffs view rendered by `PMHandoffsPage`, which
 *     reads `trpc.pmCentral.handoffs.*`. Inbound PS handoffs land
 *     in PM Central's backend through Gateway/Handoff/Event, not
 *     through a frontend cross-module trpc call.
 *
 * `<PMCentralShell>` accepts `children` so `mod.tsx` can drop the
 * inner `<Switch>` of routes into the content area without the
 * shell needing to know about wouter.
 */

import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";

import { PMCentralRoutes } from "../index";

interface SubdomainTab {
  href: string;
  label: string;
}

const TABS: SubdomainTab[] = [
  { href: PMCentralRoutes.dashboard(), label: "Dashboard" },
  { href: PMCentralRoutes.projects(), label: "Projects" },
  { href: PMCentralRoutes.tasks(), label: "Tasks" },
  { href: PMCentralRoutes.milestones(), label: "Milestones" },
  { href: PMCentralRoutes.risks(), label: "Risks" },
  { href: PMCentralRoutes.issues(), label: "Issues" },
  { href: PMCentralRoutes.decisions(), label: "Decisions" },
  { href: PMCentralRoutes.handoffs(), label: "Handoffs" },
  { href: PMCentralRoutes.settings(), label: "Settings" },
];

export function PMCentralShell({ children }: { children: ReactNode }) {
  const [pathname] = useLocation();
  const active = pickActive(pathname);
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <header className="flex items-baseline justify-between gap-4 border-b pb-2">
        <h1 className="text-xl font-semibold">PM Central</h1>
        <nav className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => {
            const isActive = t.href === active;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={
                  "rounded-md px-3 py-1.5 text-sm transition-colors " +
                  (isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted")
                }
                data-active={isActive}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Pick the most-specific tab href that the current pathname falls
 * under. Longest-prefix wins so `/pm/projects/42` highlights
 * "Projects" even though `/pm` is also a prefix.
 */
function pickActive(pathname: string): string {
  let best = TABS[0].href;
  let bestLen = -1;
  for (const t of TABS) {
    if (pathname === t.href || pathname.startsWith(t.href + "/")) {
      if (t.href.length > bestLen) {
        best = t.href;
        bestLen = t.href.length;
      }
    }
  }
  return best;
}
