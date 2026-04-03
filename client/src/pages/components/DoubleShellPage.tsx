/**
 * Double Shell — App Component demo page
 *
 * Demonstrates the Double IBM Shell pattern:
 * - S1 and S2 have independent collapse toggles
 * - S1 toggle at top, S2 toggle at bottom of S1
 * - Both default to collapsed
 * - When S2 is collapsed it is fully hidden behind S1 (single bar)
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
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
  const [s1Collapsed, setS1Collapsed] = useState(true);
  const [s2Collapsed, setS2Collapsed] = useState(true);
  const [s1Active, setS1Active] = useState("projects");
  const [s2Active, setS2Active] = useState("overview");

  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      {/* S1 — always visible, has its own toggle + S2 toggle at bottom */}
      <div
        className={cn(
          "border-r bg-background flex flex-col h-full transition-all duration-200 shrink-0",
          s1Collapsed ? "w-12" : "w-48",
        )}
      >
        {/* S1 header with S1 toggle */}
        <div
          className={cn(
            "flex items-center border-b",
            s1Collapsed ? "justify-center py-1.5" : "justify-between px-2 py-1.5",
          )}
        >
          {!s1Collapsed && (
            <span className="text-xs font-semibold text-muted-foreground truncate">
              Navigator
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => setS1Collapsed(!s1Collapsed)}
            title={s1Collapsed ? "Expand" : "Collapse"}
          >
            {s1Collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* S1 nav items */}
        <div className={cn("flex-1 min-h-0 overflow-y-auto", s1Collapsed ? "px-1 py-1" : "")}>
          {S1_ITEMS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setS1Active(key)}
              title={label}
              className={cn(
                "flex items-center w-full rounded-sm transition-colors",
                s1Collapsed ? "justify-center py-1.5" : "gap-2 px-3 py-1.5 text-xs",
                s1Active === key
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
              {!s1Collapsed && <span className="truncate">{label}</span>}
            </button>
          ))}
        </div>

        {/* S2 toggle — pinned at bottom of S1 */}
        <div className={cn("border-t", s1Collapsed ? "flex justify-center py-1.5" : "px-2 py-1.5")}>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "shrink-0",
              s1Collapsed ? "h-7 w-7 p-0" : "h-7 w-full justify-start gap-2 px-2 text-xs text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setS2Collapsed(!s2Collapsed)}
            title={s2Collapsed ? "Show Tools panel" : "Hide Tools panel"}
          >
            {s2Collapsed ? (
              <>
                <PanelRightOpen className="h-3.5 w-3.5 shrink-0" />
                {!s1Collapsed && <span className="truncate">Show Tools</span>}
              </>
            ) : (
              <>
                <PanelRightClose className="h-3.5 w-3.5 shrink-0" />
                {!s1Collapsed && <span className="truncate">Hide Tools</span>}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* S2 — fully hidden when s2Collapsed, always expanded when visible */}
      {!s2Collapsed && (
        <div className="border-r bg-background flex flex-col h-full shrink-0 w-48">
          <div className="flex items-center border-b px-2 py-1.5">
            <span className="text-xs font-semibold text-muted-foreground truncate">
              Tools
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
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
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-6">
          <h1 className="text-lg font-semibold mb-2">Double IBM Shell</h1>
          <pre className="text-xs text-muted-foreground whitespace-pre font-mono bg-muted/30 rounded-lg p-4 mb-4">{`S2 HIDDEN:              S2 VISIBLE:
┌────┬───────────┐     ┌────┬──────┬──────────┐
│    │            │     │    │      │          │
│ S1 │  Content   │     │ S1 │  S2  │ Content  │
│    │            │     │    │      │          │
│────│            │     │────│      │          │
│[>>]│            │     │[<<]│      │          │
└────┴───────────┘     └────┴──────┴──────────┘
 S2 toggle at             S2 fully visible
 bottom of S1             (no own toggle)`}</pre>
          <p className="text-sm text-muted-foreground">
            S1: <span className="font-medium text-foreground">{s1Active}</span>
            {" · "}
            S2: <span className="font-medium text-foreground">{s2Active}</span>
            {" · "}
            S1: <span className="font-medium text-foreground">{s1Collapsed ? "Collapsed" : "Expanded"}</span>
            {" · "}
            S2: <span className="font-medium text-foreground">{s2Collapsed ? "Hidden" : "Visible"}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            S1 toggle (top) controls S1. S2 toggle (bottom of S1) controls S2. Both default collapsed. S2 hides fully behind S1.
          </p>

          {/* ── Source Code ──────────────────────────────────────── */}
          <h2 className="text-sm font-semibold mt-6 mb-2">Source Code</h2>
          <pre className="text-[10px] leading-relaxed text-muted-foreground whitespace-pre overflow-x-auto font-mono bg-muted/30 rounded-lg p-4">{`/**
 * Double Shell — App Component demo page
 *
 * PATTERN RULES:
 * - Same shell wrapper as Simple Shell:
 *   "flex -mx-6 -mt-6 overflow-hidden"
 *   + height: calc(100vh - 4rem)
 *
 * - S1 (Navigator): always visible
 *   + Collapsed: w-12 (icon-only)
 *   + Expanded:  w-48 (full labels)
 *   + S1 toggle at top, S2 toggle at bottom
 *
 * - S2 (Tools): fully hidden when collapsed
 *   + Not rendered when s2Collapsed
 *   + Always expanded (w-48) when visible
 *   + No own toggle — controlled from S1 bottom
 *
 * - Content: flex-1 min-w-0 overflow-y-auto
 *
 * - Two independent states:
 *   s1Collapsed — controls S1 width
 *   s2Collapsed — controls S2 mount/unmount
 *   Both default to true (collapsed)
 *
 * - No ScrollArea — use plain div overflow-y-auto
 *   with flex-1 min-h-0 for reliable flex layout
 *
 * - No cross-module imports — standalone clone.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  PanelLeftClose, PanelLeftOpen,
  PanelRightClose, PanelRightOpen,
  LayoutDashboard, FileText, Settings,
  Users, Package, Folder, Star, Clock,
} from "lucide-react";

const S1_ITEMS = [
  { key: "projects",  label: "Projects",  icon: Folder },
  { key: "favorites", label: "Favorites", icon: Star },
  { key: "recent",    label: "Recent",    icon: Clock },
];

const S2_ITEMS = [
  { key: "overview",  label: "Overview",  icon: LayoutDashboard },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "team",      label: "Team",      icon: Users },
  { key: "packages",  label: "Packages",  icon: Package },
  { key: "settings",  label: "Settings",  icon: Settings },
];

export default function DoubleShellPage() {
  const [s1Collapsed, setS1Collapsed] = useState(true);
  const [s2Collapsed, setS2Collapsed] = useState(true);
  const [s1Active, setS1Active] = useState("projects");
  const [s2Active, setS2Active] = useState("overview");

  return (
    <div className="flex -mx-6 -mt-6 overflow-hidden"
         style={{ height: "calc(100vh - 4rem)" }}>

      {/* S1 — always visible */}
      <div className={cn(
        "border-r bg-background flex flex-col h-full",
        "transition-all duration-200 shrink-0",
        s1Collapsed ? "w-12" : "w-48",
      )}>
        {/* S1 toggle (top) */}
        <div className={cn("flex items-center border-b",
          s1Collapsed ? "justify-center py-1.5"
                      : "justify-between px-2 py-1.5")}>
          {!s1Collapsed && (
            <span className="text-xs font-semibold
              text-muted-foreground">Navigator</span>
          )}
          <Button variant="ghost" size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => setS1Collapsed(!s1Collapsed)}>
            {s1Collapsed
              ? <PanelLeftOpen className="h-4 w-4" />
              : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        {/* S1 nav items */}
        <div className={cn("flex-1 min-h-0 overflow-y-auto",
          s1Collapsed ? "px-1 py-1" : "")}>
          {S1_ITEMS.map(({ key, label, icon: Icon }) => (
            <button key={key}
              onClick={() => setS1Active(key)}
              title={label}
              className={cn(
                "flex items-center w-full rounded-sm",
                s1Collapsed
                  ? "justify-center py-1.5"
                  : "gap-2 px-3 py-1.5 text-xs",
                s1Active === key
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted/50",
              )}>
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
              {!s1Collapsed && <span>{label}</span>}
            </button>
          ))}
        </div>

        {/* S2 toggle (bottom of S1) */}
        <div className={cn("border-t",
          s1Collapsed ? "flex justify-center py-1.5"
                      : "px-2 py-1.5")}>
          <Button variant="ghost" size="sm"
            className={cn("shrink-0",
              s1Collapsed ? "h-7 w-7 p-0"
                : "h-7 w-full justify-start gap-2 px-2 " +
                  "text-xs text-muted-foreground")}
            onClick={() => setS2Collapsed(!s2Collapsed)}
            title={s2Collapsed ? "Show Tools" : "Hide Tools"}>
            {s2Collapsed
              ? <><PanelRightOpen className="h-3.5 w-3.5" />
                  {!s1Collapsed && <span>Show Tools</span>}</>
              : <><PanelRightClose className="h-3.5 w-3.5" />
                  {!s1Collapsed && <span>Hide Tools</span>}</>}
          </Button>
        </div>
      </div>

      {/* S2 — fully hidden when collapsed */}
      {!s2Collapsed && (
        <div className="border-r bg-background flex flex-col
          h-full shrink-0 w-48">
          <div className="flex items-center border-b px-2 py-1.5">
            <span className="text-xs font-semibold
              text-muted-foreground">Tools</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {S2_ITEMS.map(({ key, label, icon: Icon }) => (
              <button key={key}
                onClick={() => setS2Active(key)}
                className={cn(
                  "flex items-center gap-2 w-full",
                  "px-3 py-1.5 text-xs rounded-sm",
                  s2Active === key
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted/50",
                )}>
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
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
