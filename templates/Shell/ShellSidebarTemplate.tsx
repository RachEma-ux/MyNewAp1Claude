/**
 * Shell Sidebar Template — Collapsible sidebar for shell containers
 *
 * Copy to: client/src/components/your-shell/YourSidebar.tsx
 * Adapt: navEntries, icons, bottom actions
 */

import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  Settings,
  Home,
  Shield,
} from "lucide-react";

interface SidebarProps {
  entityId: number;
  entityName: string;
  enabledModules: Set<string>;
  collapsed: boolean;
  onToggle: () => void;
  onOversightOpen: () => void;
}

interface NavEntry {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  always?: boolean;                                    // Always visible (not gated)
  children?: { label: string; path: string }[];        // Sub-items
}

export function ShellSidebar({
  entityId,
  entityName,
  enabledModules,
  collapsed,
  onToggle,
  onOversightOpen,
}: SidebarProps) {
  const [location] = useLocation();
  const base = `/your-shell/${entityId}`;

  /** Auto-collapse on nav click */
  const handleNav = () => {
    if (!collapsed) onToggle();
  };

  // ── Define your nav entries here ──
  const navEntries: NavEntry[] = [
    {
      key: "overview",
      label: "Overview",
      icon: <LayoutDashboard className="h-4 w-4" />,
      path: base,
      always: true,
    },
    // Add more entries matching your MODULE_KEYS...
  ];

  const visible = navEntries.filter((e) => e.always || enabledModules.has(e.key));

  const isActive = (path: string) => {
    if (path === base) return location === base;
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
          <span className="text-sm font-semibold truncate flex-1">{entityName}</span>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onToggle}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
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
            {!collapsed && <span>Back</span>}
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
                {!collapsed && <span className="truncate">{entry.label}</span>}
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
        <Link href={`${base}/settings`}>
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
