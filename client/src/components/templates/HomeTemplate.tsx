/**
 * Home Template — OpenCode-inspired Shell Layout
 *
 * Cloned from the OpenCode Web UI (v1.3.13) design language:
 * - Dark muted palette (gray-dark scale from #131010 to #f1ecec)
 * - Collapsible sidebar with icon-only / full modes
 * - Session/project list in sidebar with status indicators
 * - Content area with inset surface panels
 * - Floating action bar at bottom
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │ TOPBAR  [Logo] Title              [Status]  [Theme] [User]  │
 * ├────────┬─────────────────────────────────────────────────────┤
 * │        │                                                     │
 * │  S1    │   CONTENT AREA                                      │
 * │  Side  │   ┌─────────────────────────────────────────────┐   │
 * │  bar   │   │  Surface Panel (raised)                     │   │
 * │        │   │                                             │   │
 * │ [Nav]  │   │  Main content goes here                     │   │
 * │ [Nav]  │   │                                             │   │
 * │ [Nav]  │   └─────────────────────────────────────────────┘   │
 * │ [Nav]  │                                                     │
 * │        │   ┌──────────────────────┐ ┌────────────────────┐   │
 * │ ────── │   │  Card (inset)        │ │  Card (inset)      │   │
 * │ [Sess] │   │                      │ │                    │   │
 * │ [Sess] │   └──────────────────────┘ └────────────────────┘   │
 * │ [Sess] │                                                     │
 * │        ├─────────────────────────────────────────────────────┤
 * │ [+New] │  BOTTOM BAR  [Action]            [Status] [Action]  │
 * └────────┴─────────────────────────────────────────────────────┘
 *
 * Usage:
 *   <HomeTemplate
 *     title="My App"
 *     navItems={[...]}
 *     sessions={[...]}
 *     activeNav="dashboard"
 *     onNavigate={(key) => ...}
 *     statusText="Connected"
 *     bottomBar={<div>...</div>}
 *   >
 *     {children}
 *   </HomeTemplate>
 */

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Circle,
  ChevronRight,
} from "lucide-react";

// ── OpenCode Dark Palette ────────────────────────────────────────────────
// Derived from OpenCode Web v1.3.13 CSS (--gray-dark-1 through --gray-dark-12)
const OC = {
  bg:           "#131010", // gray-dark-1  — deepest background
  bgWeak:       "#1b1818", // gray-dark-2  — sidebar background
  bgStrong:     "#252121", // gray-dark-3  — raised surfaces
  bgStronger:   "#2d2828", // gray-dark-4  — hover states
  border:       "#343030", // gray-dark-5  — subtle borders
  borderStrong: "#3e3939", // gray-dark-6  — visible borders
  muted:        "#4b4646", // gray-dark-7  — disabled / muted elements
  mutedStrong:  "#645f5f", // gray-dark-8  — secondary text
  textWeak:     "#716c6b", // gray-dark-9  — tertiary text
  textMuted:    "#7f7979", // gray-dark-10 — placeholder text
  text:         "#b7b1b1", // gray-dark-11 — primary text
  textStrong:   "#f1ecec", // gray-dark-12 — headings / emphasis
  brand:        "#dcde8d", // surface-brand — accent / active indicator
  brandHover:   "#d0d283", // surface-brand-hover
  interactive:  "#3b82f6", // blue-500 — links, active states
  success:      "#22c55e", // green-500 — online, success
  warning:      "#f59e0b", // amber-500 — warnings
  critical:     "#ef4444", // red-500 — errors, critical
};

// ── Types ────────────────────────────────────────────────────────────────

export interface NavItem {
  key: string;
  label: string;
  icon: React.ElementType;
}

export interface SessionItem {
  id: string;
  title: string;
  status?: "active" | "idle" | "error";
  timestamp?: string;
}

interface HomeTemplateProps {
  /** App or module title shown in the topbar */
  title: string;
  /** Optional subtitle / breadcrumb */
  subtitle?: string;
  /** Icon component for the logo */
  logo?: React.ElementType;
  /** Primary navigation items */
  navItems: NavItem[];
  /** Active nav key */
  activeNav?: string;
  /** Nav click handler */
  onNavigate?: (key: string) => void;
  /** Session / project list in sidebar */
  sessions?: SessionItem[];
  /** Session click handler */
  onSessionClick?: (id: string) => void;
  /** New session handler */
  onNewSession?: () => void;
  /** Status indicator text (topbar right) */
  statusText?: string;
  /** Status color */
  statusColor?: "success" | "warning" | "critical" | "muted";
  /** Bottom action bar content */
  bottomBar?: ReactNode;
  /** Right side of topbar */
  topbarRight?: ReactNode;
  /** Main content */
  children: ReactNode;
  /** Start with sidebar collapsed */
  defaultCollapsed?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────

export default function HomeTemplate({
  title,
  subtitle,
  logo: Logo,
  navItems,
  activeNav,
  onNavigate,
  sessions = [],
  onSessionClick,
  onNewSession,
  statusText,
  statusColor = "success",
  bottomBar,
  topbarRight,
  children,
  defaultCollapsed = false,
}: HomeTemplateProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const statusColors = {
    success: OC.success,
    warning: OC.warning,
    critical: OC.critical,
    muted: OC.textWeak,
  };

  return (
    <div
      className="flex flex-col h-dvh overflow-hidden antialiased"
      style={{ backgroundColor: OC.bg, color: OC.text, fontFamily: "var(--font-sans, system-ui, sans-serif)" }}
    >
      {/* ── TOPBAR ────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between shrink-0 px-3 h-10"
        style={{ backgroundColor: OC.bgWeak, borderBottom: `1px solid ${OC.border}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {Logo && <Logo className="h-4 w-4 shrink-0" style={{ color: OC.brand }} />}
          <span className="text-xs font-semibold truncate" style={{ color: OC.textStrong }}>
            {title}
          </span>
          {subtitle && (
            <>
              <ChevronRight className="h-3 w-3 shrink-0" style={{ color: OC.muted }} />
              <span className="text-xs truncate" style={{ color: OC.textWeak }}>
                {subtitle}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {statusText && (
            <div className="flex items-center gap-1.5">
              <Circle
                className="h-2 w-2 fill-current"
                style={{ color: statusColors[statusColor] }}
              />
              <span className="text-[10px]" style={{ color: OC.textMuted }}>
                {statusText}
              </span>
            </div>
          )}
          {topbarRight}
        </div>
      </header>

      {/* ── BODY (sidebar + content) ──────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ── SIDEBAR (S1) ──────────────────────────────────────── */}
        <aside
          className="flex flex-col shrink-0 transition-all duration-200"
          style={{
            width: collapsed ? 48 : 224,
            backgroundColor: OC.bgWeak,
            borderRight: `1px solid ${OC.border}`,
          }}
        >
          {/* Sidebar header + toggle */}
          <div
            className={cn(
              "flex items-center shrink-0 h-8",
              collapsed ? "justify-center" : "justify-end px-2"
            )}
            style={{ borderBottom: `1px solid ${OC.border}` }}
          >
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1 rounded transition-colors"
              style={{ color: OC.textWeak }}
              onMouseEnter={(e) => (e.currentTarget.style.color = OC.textStrong)}
              onMouseLeave={(e) => (e.currentTarget.style.color = OC.textWeak)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-3.5 w-3.5" />
              ) : (
                <PanelLeftClose className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex flex-col gap-0.5 px-1.5 py-2">
            {navItems.map(({ key, label, icon: Icon }) => {
              const isActive = key === activeNav;
              return (
                <button
                  key={key}
                  onClick={() => onNavigate?.(key)}
                  title={label}
                  className={cn(
                    "flex items-center rounded-md transition-colors",
                    collapsed ? "justify-center h-8 w-8 mx-auto" : "gap-2.5 px-2.5 py-1.5 text-xs"
                  )}
                  style={{
                    backgroundColor: isActive ? `${OC.brand}18` : "transparent",
                    color: isActive ? OC.brand : OC.textWeak,
                    borderLeft: isActive && !collapsed ? `2px solid ${OC.brand}` : "2px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = OC.bgStronger;
                      e.currentTarget.style.color = OC.text;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = OC.textWeak;
                    }
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{label}</span>}
                </button>
              );
            })}
          </nav>

          {/* Separator */}
          <div className="mx-3 my-1" style={{ borderTop: `1px solid ${OC.border}` }} />

          {/* Sessions / Projects list */}
          <div className="flex-1 min-h-0 overflow-y-auto px-1.5">
            {!collapsed && sessions.length > 0 && (
              <div className="mb-1 px-2.5">
                <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: OC.muted }}>
                  Sessions
                </span>
              </div>
            )}
            {sessions.map((s) => {
              const statusDot = {
                active: OC.success,
                idle: OC.textWeak,
                error: OC.critical,
              }[s.status || "idle"];

              return (
                <button
                  key={s.id}
                  onClick={() => onSessionClick?.(s.id)}
                  title={s.title}
                  className={cn(
                    "flex items-center w-full rounded-md transition-colors",
                    collapsed ? "justify-center h-8 w-8 mx-auto" : "gap-2 px-2.5 py-1.5 text-xs"
                  )}
                  style={{ color: OC.textWeak }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = OC.bgStronger;
                    e.currentTarget.style.color = OC.text;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = OC.textWeak;
                  }}
                >
                  <Circle className="h-2 w-2 shrink-0 fill-current" style={{ color: statusDot }} />
                  {!collapsed && (
                    <span className="truncate flex-1 text-left">{s.title}</span>
                  )}
                  {!collapsed && s.timestamp && (
                    <span className="text-[10px] shrink-0" style={{ color: OC.muted }}>
                      {s.timestamp}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* New session button */}
          {onNewSession && (
            <div className="shrink-0 p-1.5" style={{ borderTop: `1px solid ${OC.border}` }}>
              <button
                onClick={onNewSession}
                className={cn(
                  "flex items-center w-full rounded-md transition-colors",
                  collapsed ? "justify-center h-8 w-8 mx-auto" : "gap-2 px-2.5 py-1.5 text-xs"
                )}
                style={{ color: OC.interactive }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `${OC.interactive}15`)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                title="New session"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                {!collapsed && <span>New Session</span>}
              </button>
            </div>
          )}
        </aside>

        {/* ── CONTENT AREA ──────────────────────────────────────── */}
        <main className="flex-1 min-w-0 overflow-auto p-4" style={{ backgroundColor: OC.bg }}>
          {children}
        </main>
      </div>

      {/* ── BOTTOM BAR ────────────────────────────────────────────── */}
      {bottomBar && (
        <footer
          className="flex items-center shrink-0 px-3 h-9"
          style={{ backgroundColor: OC.bgWeak, borderTop: `1px solid ${OC.border}` }}
        >
          {bottomBar}
        </footer>
      )}
    </div>
  );
}

// ── Exported Sub-components for Content Area ─────────────────────────────

/** Raised surface panel — main content container */
export function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("rounded-lg p-4", className)}
      style={{
        backgroundColor: OC.bgStrong,
        border: `1px solid ${OC.border}`,
      }}
    >
      {children}
    </div>
  );
}

/** Inset card — secondary content block */
export function InsetCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("rounded-md p-3", className)}
      style={{
        backgroundColor: `${OC.bgWeak}cc`,
        border: `1px solid ${OC.border}`,
      }}
    >
      {children}
    </div>
  );
}

/** Section heading */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-sm font-semibold mb-3" style={{ color: OC.textStrong }}>
      {children}
    </h2>
  );
}

/** Muted description text */
export function Description({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs leading-relaxed" style={{ color: OC.textMuted }}>
      {children}
    </p>
  );
}

/** Re-export the palette for use in custom content */
export { OC as OpenCodePalette };
