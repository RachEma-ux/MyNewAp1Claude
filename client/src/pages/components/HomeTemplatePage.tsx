/**
 * Home Template — App Component demo page
 *
 * Demonstrates the OpenCode-inspired Home Template shell layout:
 * Topbar + collapsible sidebar (nav + sessions) + content + bottom bar.
 * Dark muted palette cloned from OpenCode Web v1.3.13.
 */
import { useState } from "react";
import HomeTemplate, {
  Surface,
  InsetCard,
  SectionTitle,
  Description,
  OpenCodePalette as OC,
  type NavItem,
  type SessionItem,
} from "@/components/templates/HomeTemplate";
import {
  LayoutDashboard,
  MessageSquare,
  Settings,
  FileCode,
  Zap,
  Code2,
} from "lucide-react";

const navItems: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "sessions", label: "Sessions", icon: MessageSquare },
  { key: "files", label: "Files", icon: FileCode },
  { key: "actions", label: "Actions", icon: Zap },
  { key: "settings", label: "Settings", icon: Settings },
];

const sessions: SessionItem[] = [
  { id: "1", title: "Add notifications system", status: "active", timestamp: "2m" },
  { id: "2", title: "Fix auth middleware", status: "idle", timestamp: "1h" },
  { id: "3", title: "Refactor DB schema", status: "idle", timestamp: "3h" },
  { id: "4", title: "Failed deploy debug", status: "error", timestamp: "5h" },
];

export default function HomeTemplatePage() {
  const [activeNav, setActiveNav] = useState("dashboard");

  return (
    <HomeTemplate
      title="OpenCode"
      subtitle="Home Template Demo"
      logo={Code2}
      navItems={navItems}
      activeNav={activeNav}
      onNavigate={setActiveNav}
      sessions={sessions}
      onSessionClick={(id) => console.log("Session:", id)}
      onNewSession={() => console.log("New session")}
      statusText="Connected"
      statusColor="success"
      topbarRight={
        <span className="text-[10px]" style={{ color: OC.textMuted }}>v1.3.13</span>
      }
      bottomBar={
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px]" style={{ color: OC.textWeak }}>
            Home Template — OpenCode Design Language
          </span>
          <span className="text-[10px]" style={{ color: OC.muted }}>
            4 sessions
          </span>
        </div>
      }
    >
      <div className="space-y-4 max-w-4xl">

        {/* ── Drawing ────────────────────────────────────────── */}
        <Surface>
          <SectionTitle>Home Template — OpenCode Shell</SectionTitle>
          <pre
            className="text-[10px] leading-relaxed whitespace-pre font-mono rounded-lg p-4 overflow-x-auto"
            style={{ backgroundColor: OC.bg, color: OC.textWeak, border: `1px solid ${OC.border}` }}
          >{`┌──────────────────────────────────────────────────────────────┐
│ TOPBAR  [Logo] Title              [Status ●]  [v1.3.13]     │
├────────┬─────────────────────────────────────────────────────┤
│  S1    │                                                     │
│ ┌────┐ │   CONTENT AREA                                      │
│ │ ≡← │ │   ┌─────────────────────────────────────────────┐   │
│ └────┘ │   │  Surface (raised)                           │   │
│ [Dash] │   │  Main content block                         │   │
│ [Sess] │   └─────────────────────────────────────────────┘   │
│ [File] │                                                     │
│ [Actn] │   ┌──────────────────┐  ┌──────────────────────┐   │
│ [Sett] │   │  InsetCard       │  │  InsetCard           │   │
│ ────── │   │  Secondary block │  │  Secondary block     │   │
│ Sessns │   └──────────────────┘  └──────────────────────┘   │
│ ● act  │                                                     │
│ ○ idle │   ┌──────────────────┐  ┌──────────────────────┐   │
│ ○ idle │   │  InsetCard       │  │  InsetCard           │   │
│ ✕ err  │   │                  │  │                      │   │
│ ────── │   └──────────────────┘  └──────────────────────┘   │
│ [+New] │                                                     │
├────────┼─────────────────────────────────────────────────────┤
│        │  BOTTOM BAR  [info]                     [4 sessions]│
└────────┴─────────────────────────────────────────────────────┘

Collapsed (w-48px):              Expanded (w-224px):
┌──┬───────────┐                ┌──────────┬───────────┐
│≡ │           │                │ Title  ←││           │
│◈ │  Content  │                │ Dashboard│  Content  │
│◈ │           │                │ Sessions │           │
│◈ │           │                │ Files    │           │
│──│           │                │──────────│           │
│● │           │                │● Active  │           │
│○ │           │                │○ Idle    │           │
│+ │           │                │+ New Ses │           │
└──┴───────────┘                └──────────┴───────────┘`}</pre>
        </Surface>

        {/* ── Active state ───────────────────────────────────── */}
        <Surface>
          <p className="text-xs" style={{ color: OC.textMuted }}>
            Active view: <span style={{ color: OC.textStrong, fontWeight: 500 }}>{activeNav}</span>
          </p>
          <p className="text-[10px] mt-1" style={{ color: OC.muted }}>
            Topbar h-40px. Sidebar w-48/224px. Bottom bar h-36px. Content fills remaining space.
            All surfaces use OpenCode gray-dark scale (#131010 → #f1ecec). Brand accent: #dcde8d.
          </p>
        </Surface>

        {/* ── Color palette ──────────────────────────────────── */}
        <Surface>
          <SectionTitle>OpenCode Dark Palette</SectionTitle>
          <div className="flex gap-1.5 flex-wrap">
            {Object.entries(OC).map(([name, color]) => (
              <div key={name} className="flex flex-col items-center gap-0.5">
                <div
                  className="w-7 h-7 rounded-sm"
                  style={{ backgroundColor: color, border: `1px solid ${OC.borderStrong}` }}
                />
                <span className="text-[7px]" style={{ color: OC.textMuted }}>{name}</span>
                <span className="text-[7px] font-mono" style={{ color: OC.muted }}>{color}</span>
              </div>
            ))}
          </div>
        </Surface>

        {/* ── Grid demo ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InsetCard>
            <SectionTitle>Sidebar Mechanism</SectionTitle>
            <Description>
              Collapsible (48px icon-only / 224px full). Nav items with brand-colored
              left border on active. Session list with colored status dots (green=active,
              gray=idle, red=error). New session button pinned at bottom with blue accent.
              Hover states use bgStronger (#2d2828).
            </Description>
          </InsetCard>
          <InsetCard>
            <SectionTitle>Sub-components</SectionTitle>
            <Description>
              Surface — raised panel (bgStrong #252121, border #343030).
              InsetCard — recessed block (bgWeak #1b1818, border #343030).
              SectionTitle — textStrong #f1ecec, 14px semibold.
              Description — textMuted #7f7979, 12px relaxed.
              OpenCodePalette — exported color object for custom content.
            </Description>
          </InsetCard>
        </div>

        {/* ── Source Code ────────────────────────────────────── */}
        <Surface>
          <SectionTitle>Source Code</SectionTitle>
          <pre
            className="text-[10px] leading-relaxed whitespace-pre overflow-x-auto font-mono rounded-lg p-4"
            style={{ backgroundColor: OC.bg, color: OC.textWeak, border: `1px solid ${OC.border}` }}
          >{`/**
 * Home Template — OpenCode-inspired Shell Layout
 *
 * PATTERN RULES:
 * - Full h-dvh viewport. No parent padding to cancel.
 * - Topbar: h-10 (40px), fixed, bgWeak with border-bottom.
 * - Body: flex row, sidebar + content, flex-1 min-h-0.
 * - Sidebar (S1): shrink-0, w-48px collapsed / w-224px expanded.
 *   + Toggle in sidebar header
 *   + Nav items with brand accent on active (left border)
 *   + Session list with status dots (green/gray/red)
 *   + New session button at bottom
 *   + Hover: bgStronger (#2d2828)
 * - Content: flex-1 min-w-0 overflow-auto p-4
 * - Bottom bar: h-9 (36px), optional, bgWeak with border-top.
 * - All colors from OpenCode gray-dark scale:
 *   bg=#131010  bgWeak=#1b1818  bgStrong=#252121
 *   border=#343030  text=#b7b1b1  textStrong=#f1ecec
 *   brand=#dcde8d (yellow-green accent)
 *
 * COMPONENTS:
 * - HomeTemplate: main shell (topbar + sidebar + content + bottom)
 * - Surface: raised panel for primary content
 * - InsetCard: recessed card for secondary content
 * - SectionTitle: heading in textStrong
 * - Description: body text in textMuted
 * - OpenCodePalette: exported color constants
 */

// ── Imports ─────────────────────────────────────────────
import HomeTemplate, {
  Surface, InsetCard, SectionTitle, Description,
  OpenCodePalette as OC,
  type NavItem, type SessionItem,
} from "@/components/templates/HomeTemplate";
import { LayoutDashboard, MessageSquare, Code2 } from "lucide-react";

// ── Nav + Sessions ──────────────────────────────────────
const navItems: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "sessions",  label: "Sessions",  icon: MessageSquare },
];
const sessions: SessionItem[] = [
  { id: "1", title: "Task name", status: "active", timestamp: "2m" },
];

// ── Usage ───────────────────────────────────────────────
<HomeTemplate
  title="My App"
  logo={Code2}
  navItems={navItems}
  activeNav="dashboard"
  onNavigate={(key) => setActive(key)}
  sessions={sessions}
  onSessionClick={(id) => console.log(id)}
  onNewSession={() => console.log("new")}
  statusText="Connected"
  statusColor="success"   // "success" | "warning" | "critical" | "muted"
  bottomBar={<span>Footer</span>}
>
  <Surface>
    <SectionTitle>Hello</SectionTitle>
    <Description>Content goes here.</Description>
  </Surface>
  <div className="grid grid-cols-2 gap-3 mt-4">
    <InsetCard><SectionTitle>A</SectionTitle></InsetCard>
    <InsetCard><SectionTitle>B</SectionTitle></InsetCard>
  </div>
</HomeTemplate>`}</pre>
        </Surface>
      </div>
    </HomeTemplate>
  );
}
