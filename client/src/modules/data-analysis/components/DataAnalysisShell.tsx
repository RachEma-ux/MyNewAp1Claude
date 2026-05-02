/**
 * DataAnalysisShell.
 *
 * Module-local frame around every Data Analysis page. Provides a
 * subdomain tab bar (GraphRAG / Data Acquisition / Data Warehouse)
 * and renders the active subdomain's page below.
 *
 * Constraints (enforced by `check:app-route-ownership` and
 * `check:module-api-boundaries`):
 *   - DOES NOT import MainLayout — this component is rendered
 *     *inside* the platform's MainLayout via the manifest's
 *     `layoutMode: "inside-main-layout"`.
 *   - DOES NOT call another module's backend (`trpc.<other>.*`).
 *   - DOES NOT reach into another module's private internals.
 *   - KGRA Agent is NOT a Data Analysis subdomain — it has its own
 *     RTLM page at `/data-analysis/kgra-agent` (mounted by the
 *     KGRA manifest, not by this capsule).
 *
 * `<DataAnalysisShell>` accepts `children` so `mod.tsx` can drop
 * the inner `<Switch>` of routes into the content area without the
 * shell needing to know about wouter.
 */

import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";

import { DataAnalysisRoutes } from "../index";

interface SubdomainTab {
  href: string;
  label: string;
}

const TABS: SubdomainTab[] = [
  { href: DataAnalysisRoutes.graphRag(), label: "GraphRAG" },
  { href: DataAnalysisRoutes.dataAcquisition(), label: "Data Acquisition" },
  { href: DataAnalysisRoutes.dataWarehouse(), label: "Data Warehouse" },
];

export function DataAnalysisShell({ children }: { children: ReactNode }) {
  const [pathname] = useLocation();
  const active = pickActive(pathname);
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <header className="flex items-baseline justify-between gap-4 border-b pb-2">
        <h1 className="text-xl font-semibold">Data Analysis</h1>
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
 * under. Longest-prefix wins so
 * `/data-analysis/data-acquisition/sources` highlights "Data
 * Acquisition" even though `/data-analysis` is also a prefix.
 *
 * The bare baseRoute `/data-analysis` redirects to GraphRAG so
 * the GraphRAG tab is highlighted in that case too.
 */
function pickActive(pathname: string): string {
  // /data-analysis itself redirects to /data-analysis/graphrag —
  // highlight GraphRAG so the tab bar reflects the post-redirect URL.
  if (pathname === "/data-analysis" || pathname === "/data-analysis/") {
    return DataAnalysisRoutes.graphRag();
  }
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
