/**
 * Double Shell — App Component demo page
 *
 * Demonstrates the Double IBM Shell pattern (cloned from PM Central Wizard):
 * - Collapsed: S1 shows icons only (w-12), S2 is completely hidden
 * - Expanded: S1 + S2 both visible side by side
 * - Single toggle controls both
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
  Folder,
  Star,
  Clock,
} from "lucide-react";

const S1_ITEMS = [
  { key: "projects", label: "Projects", icon: Folder },
  { key: "favorites", label: "Favorites", icon: Star },
  { key: "recent", label: "Recent", icon: Clock },
];

const S2_ITEMS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "team", label: "Team", icon: Users },
  { key: "packages", label: "Packages", icon: Package },
  { key: "settings", label: "Settings", icon: Settings },
];

export default function DoubleShellPage() {
  const [expanded, setExpanded] = useState(false);
  const [s1Active, setS1Active] = useState("projects");
  const [s2Active, setS2Active] = useState("overview");
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const isCollapsed = !expanded;

  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      {/* S1 — always visible: icons when collapsed, full when expanded */}
      <div
        className={cn(
          "border-r bg-background flex flex-col h-full transition-all duration-200 shrink-0",
          isCollapsed ? "w-12" : "w-48",
        )}
      >
        {/* Toggle header */}
        <div
          className={cn(
            "flex items-center border-b",
            isCollapsed ? "justify-center py-1.5" : "justify-between px-2 py-1.5",
          )}
        >
          {!isCollapsed && (
            <span className="text-xs font-semibold text-muted-foreground truncate">
              Navigator
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => setExpanded(!expanded)}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className={isCollapsed ? "px-1 py-1" : ""}>
            {S1_ITEMS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setS1Active(key)}
                title={label}
                className={cn(
                  "flex items-center w-full rounded-sm transition-colors",
                  isCollapsed
                    ? "justify-center py-1.5"
                    : "gap-2 px-3 py-1.5 text-xs",
                  s1Active === key
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                {!isCollapsed && <span className="truncate">{label}</span>}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* S2 — completely hidden when collapsed, visible when expanded */}
      {!isCollapsed && (
        <div className="border-r bg-background flex flex-col h-full transition-all duration-200 shrink-0 w-48">
          <div className="flex items-center border-b px-2 py-1.5">
            <span className="text-xs font-semibold text-muted-foreground truncate">
              Tools
            </span>
          </div>

          <ScrollArea className="flex-1">
            {S2_ITEMS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setS2Active(key)}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-sm transition-colors",
                  s2Active === key
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </ScrollArea>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-6">
          <h1 className="text-lg font-semibold mb-2">Double IBM Shell</h1>
          <pre className="text-xs text-muted-foreground whitespace-pre font-mono bg-muted/30 rounded-lg p-4 mb-4">{`COLLAPSED:              EXPANDED:
┌────┬───────────┐     ┌──────┬──────┬───────────┐
│    │            │     │      │      │           │
│ S1 │            │     │  S1  │  S2  │           │
│icon│  Content   │     │ full │ full │  Content  │
│only│            │     │      │      │           │
│    │            │     │      │      │           │
└────┴───────────┘     └──────┴──────┴───────────┘
S2 hidden               S2 visible`}</pre>
          <p className="text-sm text-muted-foreground">
            S1: <span className="font-medium text-foreground">{s1Active}</span>
            {" · "}
            S2: <span className="font-medium text-foreground">{s2Active}</span>
            {" · "}
            State: <span className="font-medium text-foreground">{isCollapsed ? "Collapsed" : "Expanded"}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Single toggle controls both sidebars. S2 is completely hidden when collapsed. On mobile: always collapsed.
          </p>

          {/* ── Source Code ──────────────────────────────────────── */}
          <h2 className="text-sm font-semibold mt-6 mb-2">Source Code</h2>
          <pre className="text-[10px] leading-relaxed text-muted-foreground whitespace-pre overflow-x-auto font-mono bg-muted/30 rounded-lg p-4">{`/**
 * Double Shell — App Component demo page
 *
 * Demonstrates the Double IBM Shell pattern:
 * Two sidebars (S1 + S2) + content area.
 *
 * PATTERN RULES:
 * - Same shell wrapper as Simple Shell:
 *   "flex -mx-6 -mt-6 overflow-hidden"
 *   + height: calc(100vh - 4rem)
 *
 * - S1 (Navigator): always visible
 *   + Collapsed: w-12 (icon-only)
 *   + Expanded:  w-48 (full labels)
 *   + Hosts the single toggle that controls BOTH bars
 *
 * - S2 (Tools): conditionally rendered
 *   + Collapsed: completely hidden (not rendered)
 *   + Expanded:  w-48 (full labels, no toggle)
 *   + Rendered via {!isCollapsed && (<S2 />)}
 *
 * - Content: flex-1 min-w-0 overflow-y-auto
 *   → takes remaining width after S1 + S2
 *
 * - Single boolean 'expanded' controls everything:
 *   isCollapsed = !expanded
 *   S1 width toggles, S2 appears/disappears
 *
 * - No cross-module imports — standalone clone.
 */

// ── Imports ─────────────────────────────────────────────
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PanelLeftClose, PanelLeftOpen,
  LayoutDashboard, FileText, Settings,
  Users, Package, Folder, Star, Clock,
} from "lucide-react";

// ── S1 nav items (Navigator) ────────────────────────────
const S1_ITEMS = [
  { key: "projects",  label: "Projects",  icon: Folder },
  { key: "favorites", label: "Favorites", icon: Star },
  { key: "recent",    label: "Recent",    icon: Clock },
];

// ── S2 nav items (Tools) ────────────────────────────────
const S2_ITEMS = [
  { key: "overview",  label: "Overview",  icon: LayoutDashboard },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "team",      label: "Team",      icon: Users },
  { key: "packages",  label: "Packages",  icon: Package },
  { key: "settings",  label: "Settings",  icon: Settings },
];

// ── Component ───────────────────────────────────────────
export default function DoubleShellPage() {
  const [expanded, setExpanded] = useState(false);
  const [s1Active, setS1Active] = useState("projects");
  const [s2Active, setS2Active] = useState("overview");
  const isCollapsed = !expanded;

  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      {/* ── S1: Navigator ────────────────────────────── */}
      {/* Always visible. Icons when collapsed, full      */}
      {/* labels when expanded. Hosts the toggle button.  */}
      <div className={cn(
        "border-r bg-background flex flex-col h-full",
        "transition-all duration-200 shrink-0",
        isCollapsed ? "w-12" : "w-48",
      )}>
        {/* Toggle header — controls BOTH sidebars */}
        <div className={cn(
          "flex items-center border-b",
          isCollapsed
            ? "justify-center py-1.5"
            : "justify-between px-2 py-1.5",
        )}>
          {!isCollapsed && (
            <span className="text-xs font-semibold
              text-muted-foreground truncate">
              Navigator
            </span>
          )}
          <Button variant="ghost" size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => setExpanded(!expanded)}
          >
            {isCollapsed
              ? <PanelLeftOpen  className="h-4 w-4" />
              : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className={isCollapsed ? "px-1 py-1" : ""}>
            {S1_ITEMS.map(({ key, label, icon: Icon }) => (
              <button key={key}
                onClick={() => setS1Active(key)}
                title={label}
                className={cn(
                  "flex items-center w-full rounded-sm",
                  isCollapsed
                    ? "justify-center py-1.5"
                    : "gap-2 px-3 py-1.5 text-xs",
                  s1Active === key
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0
                  opacity-70" />
                {!isCollapsed && <span>{label}</span>}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* ── S2: Tools ────────────────────────────────── */}
      {/* Completely hidden when collapsed.               */}
      {/* Rendered only when !isCollapsed.                 */}
      {/* No toggle — controlled by S1's toggle.          */}
      {!isCollapsed && (
        <div className="border-r bg-background flex flex-col
          h-full transition-all duration-200 shrink-0 w-48">
          <div className="flex items-center border-b
            px-2 py-1.5">
            <span className="text-xs font-semibold
              text-muted-foreground truncate">
              Tools
            </span>
          </div>

          <ScrollArea className="flex-1">
            {S2_ITEMS.map(({ key, label, icon: Icon }) => (
              <button key={key}
                onClick={() => setS2Active(key)}
                className={cn(
                  "flex items-center gap-2 w-full",
                  "px-3 py-1.5 text-xs rounded-sm",
                  s2Active === key
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0
                  opacity-70" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </ScrollArea>
        </div>
      )}

      {/* ── Content ──────────────────────────────────── */}
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
