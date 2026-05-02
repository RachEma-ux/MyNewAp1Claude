/**
 * CommunicationShell.
 *
 * Module-local frame around every Communication page. Provides a
 * subdomain tab bar (Chat / Conversations / Video Meeting /
 * Notifications) and renders the active subdomain's page below.
 *
 * Constraints (enforced by `check:app-route-ownership`):
 *   - DOES NOT import MainLayout — this component is rendered
 *     *inside* the platform's MainLayout via the manifest's
 *     `layoutMode: "inside-main-layout"`.
 *   - DOES NOT call another module's backend (`trpc.<other>.*`).
 *   - DOES NOT reach into another module's private internals.
 *
 * `<CommunicationShell>` accepts `children` so `mod.tsx` can drop
 * the inner `<Switch>` of routes into the content area without the
 * shell needing to know about wouter.
 */

import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";

import { CommunicationRoutes } from "../index";

interface SubdomainTab {
  href: string;
  label: string;
}

const TABS: SubdomainTab[] = [
  { href: CommunicationRoutes.dashboard(), label: "Overview" },
  { href: CommunicationRoutes.chat(), label: "Chat" },
  { href: CommunicationRoutes.conversations(), label: "Conversations" },
  { href: CommunicationRoutes.videoMeeting(), label: "Video Meeting" },
  { href: CommunicationRoutes.notifications(), label: "Notifications" },
];

export function CommunicationShell({ children }: { children: ReactNode }) {
  const [pathname] = useLocation();
  const active = pickActive(pathname);
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <header className="flex items-baseline justify-between gap-4 border-b pb-2">
        <h1 className="text-xl font-semibold">Communication</h1>
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
 * under. Longest-prefix wins so `/communication/chat/123` highlights
 * "Chat" even though `/communication` is also a prefix.
 */
function pickActive(pathname: string): string {
  let best = TABS[0].href;
  for (const t of TABS) {
    if (pathname === t.href || pathname.startsWith(t.href + "/")) {
      if (t.href.length > best.length) best = t.href;
      else if (t.href === pathname) best = t.href;
    }
  }
  return best;
}
