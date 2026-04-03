/**
 * Home Template Demo Page
 *
 * Showcases the OpenCode-inspired Home Template shell layout
 * with sample navigation, sessions, and content panels.
 */
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
  return (
    <HomeTemplate
      title="OpenCode"
      subtitle="Home Template Demo"
      logo={Code2}
      navItems={navItems}
      activeNav="dashboard"
      onNavigate={(key) => console.log("Navigate:", key)}
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
        {/* Main surface panel */}
        <Surface>
          <SectionTitle>Welcome</SectionTitle>
          <Description>
            This is the Home Template — a shell layout cloned from the OpenCode Web UI (v1.3.13).
            It features a collapsible sidebar with navigation and session list, a topbar with
            status indicator, and a bottom action bar. All colors use the OpenCode dark palette.
          </Description>
        </Surface>

        {/* Grid of inset cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InsetCard>
            <SectionTitle>Sidebar</SectionTitle>
            <Description>
              Collapsible (48px / 224px). Nav items with brand-colored active indicator.
              Session list with status dots. New session button pinned at bottom.
            </Description>
          </InsetCard>

          <InsetCard>
            <SectionTitle>Color Palette</SectionTitle>
            <div className="flex gap-1 mt-2 flex-wrap">
              {Object.entries(OC).map(([name, color]) => (
                <div key={name} className="flex flex-col items-center gap-0.5">
                  <div
                    className="w-6 h-6 rounded-sm border"
                    style={{ backgroundColor: color, borderColor: OC.borderStrong }}
                  />
                  <span className="text-[8px]" style={{ color: OC.textMuted }}>{name}</span>
                </div>
              ))}
            </div>
          </InsetCard>

          <InsetCard>
            <SectionTitle>Surfaces</SectionTitle>
            <Description>
              Two levels: Surface (raised, lighter) for main content,
              InsetCard (recessed, darker) for secondary blocks.
              Both use the OpenCode border and background tokens.
            </Description>
          </InsetCard>

          <InsetCard>
            <SectionTitle>Usage</SectionTitle>
            <pre
              className="text-[10px] mt-2 p-2 rounded overflow-x-auto"
              style={{ backgroundColor: OC.bg, color: OC.textWeak, border: `1px solid ${OC.border}` }}
            >
{`<HomeTemplate
  title="My App"
  navItems={[...]}
  sessions={[...]}
  activeNav="dashboard"
  onNavigate={(k) => ...}
>
  <Surface>
    <SectionTitle>Hello</SectionTitle>
    <Description>Content</Description>
  </Surface>
</HomeTemplate>`}
            </pre>
          </InsetCard>
        </div>
      </div>
    </HomeTemplate>
  );
}
