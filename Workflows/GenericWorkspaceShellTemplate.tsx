/**
 * Generic Workspace Shell Template — Canonical Parent Blueprint
 *
 * This is the structural baseline for ALL workspace shells.
 * Specialized templates (Personal, Project, Research) inherit this structure
 * and override only the CONFIG OVERRIDES section.
 *
 * DO NOT instantiate this template directly.
 * Copy to a specialized template and customize the CONFIG OVERRIDES block.
 *
 * Structural elements (Shell Container, Sidebar, StatusBar, OversightDrawer,
 * ModuleGate, Pin/Unpin) are MANDATORY and must not be removed.
 */

import { useState } from "react";
import { useParams, Route, Switch, Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2, Pin, PinOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Settings,
  ChevronLeft,
  ChevronRight,
  Home,
  Shield,
  Activity,
  CheckCircle2,
  XCircle,
} from "lucide-react";

// ============================================================================
// CONFIG OVERRIDES — Specialized templates modify ONLY this section
// ============================================================================

/** Module keys — must match backend MODULE_KEYS */
const MODULE_KEYS = ["overview", "settings"] as const;
type ModuleKey = (typeof MODULE_KEYS)[number];

/** Module icon map */
const MODULE_ICONS: Record<string, React.ReactNode> = {
  overview: <LayoutDashboard className="h-4 w-4" />,
  settings: <Settings className="h-4 w-4" />,
};

/** Module labels */
const MODULE_LABELS: Record<string, string> = {
  overview: "Overview",
  settings: "Settings",
};

/** Route base path prefix */
const ROUTE_PREFIX = "/w";

/** Module presets (default enabled modules) */
const DEFAULT_MODULES: ModuleKey[] = ["overview", "settings"];

/** Always-enabled modules (not gatable) */
const ALWAYS_ON_MODULES: ModuleKey[] = ["overview", "settings"];

/** Entity display name */
const ENTITY_LABEL = "Workspace";

// ============================================================================
// END CONFIG OVERRIDES
// ============================================================================

// ── Types ──

interface NavEntry {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  always?: boolean;
  children?: { label: string; path: string }[];
}

interface ModuleGateProps {
  moduleKey: string;
  moduleName: string;
  children: React.ReactNode;
}

// ── Sidebar Component ──

interface SidebarProps {
  entityId: number;
  entityName: string;
  enabledModules: Set<string>;
  collapsed: boolean;
  onToggle: () => void;
  onOversightOpen: () => void;
  navEntries: NavEntry[];
  basePath: string;
}

function WorkspaceSidebar({
  entityId,
  entityName,
  enabledModules,
  collapsed,
  onToggle,
  onOversightOpen,
  navEntries,
  basePath,
}: SidebarProps) {
  const [location] = useLocation();

  const handleNav = () => {
    if (!collapsed) onToggle();
  };

  const visible = navEntries.filter(
    (e) => e.always || enabledModules.has(e.key)
  );

  const isActive = (path: string) => {
    if (path === basePath) return location === basePath;
    return location.startsWith(path);
  };

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-card transition-all duration-200 shrink-0",
        collapsed ? "w-12" : "w-60"
      )}
    >
      {/* Entity title + toggle */}
      <div className="flex items-center gap-2 border-b px-3 h-12">
        {!collapsed && (
          <span className="text-sm font-semibold truncate flex-1">
            {entityName}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onToggle}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Back link */}
      <div className="px-2 pt-2 pb-1">
        <Link href="/">
          <button
            onClick={handleNav}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
              collapsed && "justify-center px-0"
            )}
          >
            <Home className="h-4 w-4" />
            {!collapsed && <span>All Workspaces</span>}
          </button>
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {visible.map((entry) => {
          const active = isActive(entry.path);
          const item = (
            <Link key={entry.key} href={entry.path}>
              <button
                onClick={handleNav}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  collapsed && "justify-center px-0"
                )}
              >
                {entry.icon}
                {!collapsed && (
                  <span className="truncate">{entry.label}</span>
                )}
              </button>
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={entry.key}>
                <TooltipTrigger asChild>{item}</TooltipTrigger>
                <TooltipContent side="right">{entry.label}</TooltipContent>
              </Tooltip>
            );
          }

          return (
            <div key={entry.key}>
              {item}
              {entry.children && active && !collapsed && (
                <div className="ml-6 mt-0.5 space-y-0.5">
                  {entry.children.map((child) => (
                    <Link key={child.path} href={child.path}>
                      <button
                        onClick={handleNav}
                        className={cn(
                          "flex items-center w-full px-2 py-1 text-xs rounded-md transition-colors",
                          location === child.path
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {child.label}
                      </button>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="border-t p-2 space-y-0.5">
        <button
          onClick={onOversightOpen}
          className={cn(
            "flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            collapsed && "justify-center px-0"
          )}
        >
          <Shield className="h-4 w-4" />
          {!collapsed && <span>Oversight</span>}
        </button>
        <Link href={`${basePath}/settings`}>
          <button
            className={cn(
              "flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
              collapsed && "justify-center px-0"
            )}
          >
            <Settings className="h-4 w-4" />
            {!collapsed && <span>Settings</span>}
          </button>
        </Link>
      </div>
    </aside>
  );
}

// ── Status Bar Component ──

interface StatusBarProps {
  entityId: number;
  enabledModuleCount: number;
  onOversightOpen?: () => void;
}

function WorkspaceStatusBar({
  entityId,
  enabledModuleCount,
  onOversightOpen,
}: StatusBarProps) {
  const healthy = true; // Wire governance health query here

  return (
    <div className="flex items-center justify-between border-t bg-card px-4 h-7 text-xs text-muted-foreground shrink-0">
      <div className="flex items-center gap-4">
        <span className="font-mono">WS-{entityId}</span>
        <span>{enabledModuleCount} modules</span>
      </div>
      <div className="flex items-center gap-3">
        {onOversightOpen && (
          <button
            onClick={onOversightOpen}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Shield
              className={cn(
                "h-3 w-3",
                healthy ? "text-green-500" : "text-red-500"
              )}
            />
            <span>{healthy ? "OK" : "Issue"}</span>
          </button>
        )}
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <span>Connected</span>
        </div>
      </div>
    </div>
  );
}

// ── Oversight Drawer Component ──

interface OversightDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: number;
}

function WorkspaceOversightDrawer({
  open,
  onOpenChange,
  entityId,
}: OversightDrawerProps) {
  // Wire governance self-check query here (enabled: open)
  const checks = [
    { name: "Schema Valid", passed: true },
    { name: "Permissions OK", passed: true },
    { name: "Data Integrity", passed: true },
    { name: "Policy Compliance", passed: true },
    { name: "Resource Limits", passed: true },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[380px] sm:max-w-[380px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Governance Oversight
          </SheetTitle>
          <SheetDescription>
            Health checks and audit trail for {ENTITY_LABEL} {entityId}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 mt-4">
          <div className="space-y-4 pr-4">
            {/* Health Checks */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Health Checks
              </h3>
              <div className="space-y-1">
                {checks.map((check, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs text-muted-foreground ml-2"
                  >
                    {check.passed ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-500" />
                    )}
                    <span>{check.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <Separator />
            {/* Governance Injection Points */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Governance Injection</h3>
              <div className="space-y-1 text-xs text-muted-foreground ml-2">
                <p>Identity Validation: Active</p>
                <p>Module Approval: Enforced</p>
                <p>Data Access Audit: Logging</p>
                <p>Policy Inheritance: Applied</p>
                <p>Resource Enforcement: Active</p>
              </div>
            </div>
            <Separator />
            {/* Activity Feed */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Recent Activity</h3>
              <p className="text-xs text-muted-foreground">
                Wire activity timeline query here
              </p>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ── Main Shell Component ──

export default function GenericWorkspaceShell() {
  // ── Route params ──
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = parseInt(params.workspaceId || "0", 10);
  const [location, navigate] = useLocation();

  // ── Shell state ──
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [oversightOpen, setOversightOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  // ── Data fetching (wire to tRPC) ──
  // const { data: workspace, isLoading } = trpc.workspaces.get.useQuery(
  //   { id: workspaceId },
  //   { enabled: workspaceId > 0 }
  // );
  // const { data: modules } = trpc.modules.manage.list.useQuery(
  //   { workspaceId },
  //   { enabled: workspaceId > 0, retry: 2 }
  // );

  // ── Placeholder data (remove when wiring) ──
  const isLoading = false;
  const workspace = { name: `${ENTITY_LABEL} ${workspaceId}` };
  const modules: { moduleKey: string; enabled: boolean }[] = [];

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Not found ──
  if (!workspace) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <p className="text-destructive text-lg font-medium">
            {ENTITY_LABEL} not found
          </p>
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
      ? new Set(
          modules
            .filter((m) => m.enabled)
            .map((m) => m.moduleKey)
        )
      : new Set<string>(DEFAULT_MODULES);
  const enabledCount = enabledModules.size;
  const basePath = `${ROUTE_PREFIX}/${workspaceId}`;

  // ── Module gate ──
  function ModuleGate({ moduleKey, moduleName, children }: ModuleGateProps) {
    if (
      !ALWAYS_ON_MODULES.includes(moduleKey as ModuleKey) &&
      !enabledModules.has(moduleKey)
    ) {
      return (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="text-center space-y-2">
            <p className="text-muted-foreground text-lg">{moduleName}</p>
            <p className="text-sm text-muted-foreground">
              This module is not enabled for this workspace.
            </p>
          </div>
        </div>
      );
    }
    return <>{children}</>;
  }

  // ── Navigation entries ──
  const navEntries: NavEntry[] = [
    {
      key: "overview",
      label: MODULE_LABELS.overview,
      icon: MODULE_ICONS.overview,
      path: basePath,
      always: true,
    },
    // Specialized templates add module-specific entries here
  ];

  // ── Shared shell content ──
  const shellContent = (
    <>
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <WorkspaceSidebar
          entityId={workspaceId}
          entityName={workspace.name}
          enabledModules={enabledModules}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          onOversightOpen={() => setOversightOpen(true)}
          navEntries={navEntries}
          basePath={basePath}
        />

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <Switch>
            {/* Specialized templates add module routes here */}
            {/* Example:
            <Route path={`${basePath}/module-key`}>
              <ModuleGate moduleKey="module-key" moduleName="Module Name">
                <ModulePage workspaceId={workspaceId} />
              </ModuleGate>
            </Route>
            */}

            {/* Default: Overview */}
            <Route>
              <div className="p-6 space-y-6">
                <h1 className="text-2xl font-bold">
                  {workspace.name} — Overview
                </h1>
                <p className="text-sm text-muted-foreground">
                  {enabledCount} modules enabled
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {navEntries
                    .filter(
                      (i) => i.key !== "overview" && enabledModules.has(i.key)
                    )
                    .map((item) => (
                      <Link key={item.key} href={item.path}>
                        <Card className="cursor-pointer hover:border-primary/50 transition-colors">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                              {item.icon} {item.label}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-muted-foreground">
                              Open {item.label.toLowerCase()}
                            </p>
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

      {/* Status Bar */}
      <WorkspaceStatusBar
        entityId={workspaceId}
        enabledModuleCount={enabledCount}
        onOversightOpen={() => setOversightOpen(true)}
      />

      {/* Oversight Drawer */}
      <WorkspaceOversightDrawer
        open={oversightOpen}
        onOpenChange={setOversightOpen}
        entityId={workspaceId}
      />
    </>
  );

  // ── PINNED: fills entire content area ──
  if (pinned) {
    return (
      <div
        className="-m-6 flex flex-col relative"
        style={{ height: "calc(100vh - 4rem)" }}
      >
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
    <div
      className="-m-6 p-3 flex flex-col"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      <div className="flex flex-col flex-1 rounded-lg border border-border bg-background shadow-sm overflow-hidden">
        {/* Title Bar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/40 shrink-0">
          <span className="text-xs font-medium text-muted-foreground truncate">
            {workspace.name}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPinned(true)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Pin"
            >
              <Pin className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => navigate("/")}
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Close"
            >
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
