/**
 * Simple Shell — App Component demo page
 *
 * Demonstrates the Simple IBM Shell pattern:
 * One sidebar + content, cloned from PmCentralSidebarLayout.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  FileText,
  Settings,
  Users,
  Package,
} from "lucide-react";

const NAV_ITEMS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "team", label: "Team", icon: Users },
  { key: "packages", label: "Packages", icon: Package },
  { key: "settings", label: "Settings", icon: Settings },
];

export default function SimpleShellPage() {
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState("overview");
  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      {/* Sidebar — cloned from PMProjectSidebar */}
      <div
        className={cn(
          "border-r bg-background flex flex-col h-full transition-all duration-200 shrink-0",
          collapsed ? "w-12" : "w-56",
        )}
      >
        <div
          className={cn(
            "flex items-center border-b",
            collapsed ? "justify-center py-1.5" : "justify-between px-2 py-1.5",
          )}
        >
          {!collapsed && (
            <span className="text-xs font-semibold text-muted-foreground truncate">
              Simple Shell
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className={collapsed ? "px-1 py-1" : ""}>
            {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActive(key)}
                title={label}
                className={cn(
                  "flex items-center w-full rounded-sm transition-colors",
                  collapsed
                    ? "justify-center py-1.5"
                    : "gap-2 px-3 py-1.5 text-xs",
                  active === key
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                {!collapsed && <span className="truncate">{label}</span>}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-6">
          <h1 className="text-lg font-semibold mb-2">Simple IBM Shell</h1>
          <pre className="text-xs text-muted-foreground whitespace-pre font-mono bg-muted/30 rounded-lg p-4 mb-4">{`┌──────────────────────────────────┐
│         App Header (4rem)        │
├─────────┬────────────────────────┤
│         │                        │
│         │                        │
│ Sidebar │       Content          │
│         │                        │
│         │                        │
│         │                        │
│         │                        │
├─────────┴────────────────────────┤
│   calc(100vh - 4rem)             │
└──────────────────────────────────┘`}</pre>
          <p className="text-sm text-muted-foreground">
            Active view: <span className="font-medium text-foreground">{active}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Sidebar height = Content height = calc(100vh - 4rem). Both are children of the same flex parent. Sidebar uses h-full which equals that.
          </p>

          {/* ── Source Code ──────────────────────────────────────── */}
          <h2 className="text-sm font-semibold mt-6 mb-2">Source Code</h2>
          <pre className="text-[10px] leading-relaxed text-muted-foreground whitespace-pre overflow-x-auto font-mono bg-muted/30 rounded-lg p-4">{`/**
 * Simple Shell — App Component demo page
 *
 * Demonstrates the Simple IBM Shell pattern:
 * One sidebar + content, cloned from PmCentralSidebarLayout.
 *
 * PATTERN RULES:
 * - Page wrapper: "flex -mx-6 -mt-6 overflow-hidden"
 *   + height: calc(100vh - 4rem)
 *   → cancels MainLayout's <main p-6> padding, fills
 *     the full area below the 4rem app header.
 *
 * - Sidebar: direct flex child with shrink-0
 *   + h-full (inherits parent's calc height)
 *   + w-12 collapsed (icon-only) / w-56 expanded
 *   + border-r separates from content
 *   + ScrollArea for overflow
 *   + PanelLeftOpen / PanelLeftClose toggle
 *
 * - Content: flex-1 min-w-0 overflow-y-auto
 *   → takes remaining width, scrolls independently
 *
 * - No cross-module imports — this is a standalone clone.
 */

// ── Imports ─────────────────────────────────────────────
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PanelLeftClose, PanelLeftOpen,
  LayoutDashboard, FileText, Settings, Users, Package,
} from "lucide-react";

// ── Sidebar nav items ───────────────────────────────────
const NAV_ITEMS = [
  { key: "overview",  label: "Overview",  icon: LayoutDashboard },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "team",      label: "Team",      icon: Users },
  { key: "packages",  label: "Packages",  icon: Package },
  { key: "settings",  label: "Settings",  icon: Settings },
];

// ── Component ───────────────────────────────────────────
export default function SimpleShellPage() {
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState("overview");

  return (
    {/* Shell wrapper — cancels parent padding, sets height */}
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      {/* ── Sidebar ──────────────────────────────────── */}
      {/* Cloned from PMProjectSidebar.tsx classes.       */}
      {/* shrink-0 prevents flex shrinking on narrow      */}
      {/* screens. h-full = parent's calc height.         */}
      <div className={cn(
        "border-r bg-background flex flex-col h-full",
        "transition-all duration-200 shrink-0",
        collapsed ? "w-12" : "w-56",
      )}>
        {/* Toggle header */}
        <div className={cn(
          "flex items-center border-b",
          collapsed
            ? "justify-center py-1.5"
            : "justify-between px-2 py-1.5",
        )}>
          {!collapsed && (
            <span className="text-xs font-semibold
              text-muted-foreground truncate">
              Simple Shell
            </span>
          )}
          <Button variant="ghost" size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed
              ? <PanelLeftOpen  className="h-4 w-4" />
              : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        {/* Nav items with ScrollArea for overflow */}
        <ScrollArea className="flex-1">
          <div className={collapsed ? "px-1 py-1" : ""}>
            {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
              <button key={key}
                onClick={() => setActive(key)}
                title={label}
                className={cn(
                  "flex items-center w-full rounded-sm",
                  collapsed
                    ? "justify-center py-1.5"
                    : "gap-2 px-3 py-1.5 text-xs",
                  active === key
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0
                  opacity-70" />
                {!collapsed && <span>{label}</span>}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* ── Content ──────────────────────────────────── */}
      {/* flex-1: fills remaining width                   */}
      {/* min-w-0: prevents flex blowout                  */}
      {/* overflow-y-auto: scrolls independently          */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-6">
          {/* page content here */}
        </div>
      </div>
    </div>
  );
}`}</pre>
        </div>
      </div>
    </div>
  );
}
