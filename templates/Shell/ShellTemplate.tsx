/**
 * Shell Template — Copy and adapt for new shell containers
 *
 * USAGE:
 *   1. Copy this file to client/src/pages/YourShell.tsx
 *   2. Find-replace: ENTITY → YourEntity, entity → yourEntity
 *   3. Update MODULE_KEYS, navItems, sub-routes, and tRPC queries
 *   4. Create sub-pages in client/src/pages/your-shell/
 *   5. Register in App.tsx with ProtectedRoute
 */

import { useState } from "react";
import { useParams, Route, Switch, Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2, Pin, PinOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LayoutDashboard,
  Settings as SettingsIcon,
  BarChart3,
} from "lucide-react";

// ── Import your shell components (copy from components/workspace/) ──
// import { ShellSidebar } from "@/components/your-shell/ShellSidebar";
// import { ShellStatusBar } from "@/components/your-shell/ShellStatusBar";
// import { ShellOversightDrawer } from "@/components/your-shell/ShellOversightDrawer";
// import { ModuleDisabled } from "@/components/workspace/ModuleDisabled"; // reusable

// ── Import your sub-pages ──
// import { DashboardPage } from "./your-shell/DashboardPage";
// import { SettingsPage } from "./your-shell/SettingsPage";
// import { ReportsPage } from "./your-shell/ReportsPage";

// ── Module icon map ──
const moduleIcons: Record<string, React.ReactNode> = {
  dashboard: <LayoutDashboard className="h-5 w-5" />,
  settings: <SettingsIcon className="h-5 w-5" />,
  reports: <BarChart3 className="h-5 w-5" />,
};

// ── All module keys (must match backend MODULE_KEYS) ──
const ALL_MODULE_KEYS = ["dashboard", "settings", "reports"];

export default function ShellTemplate() {
  // ── Parse route param ──
  const params = useParams<{ entityId: string }>();
  const entityId = parseInt(params.entityId || "0", 10);
  const [location, navigate] = useLocation();

  // ── Shell state ──
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [oversightOpen, setOversightOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  // ── Data fetching (adapt to your tRPC router) ──
  // const { data: entity, isLoading } = trpc.yourEntity.get.useQuery(
  //   { id: entityId },
  //   { enabled: entityId > 0 }
  // );
  // const { data: modules } = trpc.yourModules.manage.list.useQuery(
  //   { entityId },
  //   { enabled: entityId > 0, retry: 2 }
  // );

  // ── PLACEHOLDER: remove when wiring real data ──
  const isLoading = false;
  const entity = { name: `Entity ${entityId}` };
  const modules: any[] = [];

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Not found ──
  if (!entity) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <p className="text-destructive text-lg font-medium">Not found</p>
          <Link href="/">
            <Button variant="outline">Go Back</Button>
          </Link>
        </div>
      </div>
    );
  }

  // ── Module enablement ──
  const enabledModules =
    modules && modules.length > 0
      ? new Set(modules.filter((m: any) => m.enabled).map((m: any) => m.moduleKey))
      : new Set(ALL_MODULE_KEYS);
  const enabledCount = enabledModules.size;
  const basePath = `/your-shell/${entityId}`;

  // ── Module gate ──
  function ModuleGate({
    moduleKey,
    moduleName,
    children,
  }: {
    moduleKey: string;
    moduleName: string;
    children: React.ReactNode;
  }) {
    if (!enabledModules.has(moduleKey)) {
      // return <ModuleDisabled moduleName={moduleName} workspaceId={entityId} />;
      return <div className="p-6 text-muted-foreground">{moduleName} is disabled</div>;
    }
    return <>{children}</>;
  }

  // ── Nav items ──
  const navItems = [
    { key: "dashboard", label: "Dashboard", icon: moduleIcons.dashboard, path: `${basePath}/dashboard` },
    { key: "settings", label: "Settings", icon: moduleIcons.settings, path: `${basePath}/settings` },
    { key: "reports", label: "Reports", icon: moduleIcons.reports, path: `${basePath}/reports` },
  ];

  // ── Shared shell content (rendered in both pinned/unpinned) ──
  const shellContent = (
    <>
      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        {/* Replace with your ShellSidebar component */}
        <aside className={`flex flex-col border-r bg-card shrink-0 transition-all ${sidebarCollapsed ? "w-12" : "w-60"}`}>
          <div className="flex items-center gap-2 border-b px-3 h-12">
            {!sidebarCollapsed && <span className="text-sm font-semibold truncate flex-1">{entity.name}</span>}
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
              {sidebarCollapsed ? ">" : "<"}
            </Button>
          </div>
          <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
            {navItems.filter(i => enabledModules.has(i.key)).map(item => (
              <Link key={item.key} href={item.path}>
                <button className="flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:bg-accent">
                  {item.icon}
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </button>
              </Link>
            ))}
          </nav>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-auto">
          <Switch>
            {/* Add your module routes here */}
            {/* Example:
            <Route path={`${basePath}/dashboard`}>
              <ModuleGate moduleKey="dashboard" moduleName="Dashboard">
                <DashboardPage entityId={entityId} />
              </ModuleGate>
            </Route>
            */}

            {/* Default: overview */}
            <Route>
              <div className="p-6 space-y-6">
                <h1 className="text-2xl font-bold">{entity.name} — Overview</h1>
                <p className="text-sm text-muted-foreground">{enabledCount} modules enabled</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {navItems.filter(i => enabledModules.has(i.key)).map(item => (
                    <Link key={item.key} href={item.path}>
                      <Card className="cursor-pointer hover:border-primary/50 transition-colors">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            {item.icon} {item.label}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">Open {item.label.toLowerCase()}</p>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            </Route>
          </Switch>
        </main>
      </div>

      {/* ── Status Bar ── */}
      <div className="flex items-center justify-between border-t bg-card px-4 h-7 text-xs text-muted-foreground shrink-0">
        <span className="font-mono">ID-{entityId}</span>
        <span>{enabledCount} modules</span>
      </div>
    </>
  );

  // ── PINNED: fills entire content area ──
  if (pinned) {
    return (
      <div className="-m-6 flex flex-col relative" style={{ height: "calc(100vh - 4rem)" }}>
        <button
          onClick={() => setPinned(false)}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Detach"
        >
          <PinOff className="h-4 w-4" />
        </button>
        {shellContent}
      </div>
    );
  }

  // ── UNPINNED (default): inset panel with border ──
  return (
    <div className="-m-6 p-3 flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>
      <div className="flex flex-col flex-1 rounded-lg border border-border bg-background shadow-sm overflow-hidden">
        {/* Title Bar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/40 shrink-0">
          <span className="text-xs font-medium text-muted-foreground truncate">{entity.name}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPinned(true)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Pin">
              <Pin className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => navigate("/")} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Close">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex flex-col flex-1 overflow-hidden">
          {shellContent}
        </div>
      </div>
    </div>
  );
}
