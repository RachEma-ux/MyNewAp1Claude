/**
 * WS Sandbox — Workspace system entry point
 *
 * Routes to:
 *   /ws/dashboard    → WS Dashboard
 *   /ws/control-panel → WS Control Panel
 *   /ws/wizard       → WS Wizard
 *   /ws/list         → WS List
 *   /ws/catalog      → WS Catalog
 */

import { Route, Switch, useLocation, Link } from "wouter";
import { lazy, Suspense } from "react";
import { Loader2, LayoutDashboard, Settings, Wand2, List, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

const WSDashboardPage = lazy(() => import("./WSDashboardPage"));
const WSControlPanelPage = lazy(() => import("./WSControlPanelPage"));
const WSWizardPage = lazy(() => import("./WSWizardPage"));
const WSListPage = lazy(() => import("./WSListPage"));
const WSCatalogPage = lazy(() => import("./WSCatalogPage"));

const NAV_ITEMS = [
  { path: "/ws/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { path: "/ws/control-panel", label: "Control Panel", icon: <Settings className="h-4 w-4" /> },
  { path: "/ws/wizard", label: "Wizard", icon: <Wand2 className="h-4 w-4" /> },
  { path: "/ws/list", label: "List", icon: <List className="h-4 w-4" /> },
  { path: "/ws/catalog", label: "Catalog", icon: <Globe className="h-4 w-4" /> },
];

export default function WSSandboxPage() {
  const [location] = useLocation();

  return (
    <div>
      {/* Top navigation for WS Sandbox surfaces */}
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.path || location.startsWith(item.path + "/");
            return (
              <Link key={item.path} href={item.path}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  size="sm"
                  className="text-xs gap-1.5 whitespace-nowrap"
                >
                  {item.icon}
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="p-4">
        <Suspense fallback={null}>
          <Switch>
            <Route path="/ws/dashboard" component={WSDashboardPage} />
            <Route path="/ws/control-panel" component={WSControlPanelPage} />
            <Route path="/ws/wizard" component={WSWizardPage} />
            <Route path="/ws/list" component={WSListPage} />
            <Route path="/ws/catalog" component={WSCatalogPage} />
            <Route>{() => <WSDashboardPage />}</Route>
          </Switch>
        </Suspense>
      </div>
    </div>
  );
}
