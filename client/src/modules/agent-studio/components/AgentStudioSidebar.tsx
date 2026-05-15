/**
 * AI Agent Studio — S1 Sidebar (IBM-style collapsible nav)
 *
 * Mirrors the Code Studio sidebar pattern: collapsed = w-12 (icons only),
 * expanded = w-56 (icons + labels). Grouped sections per the AI Agent Studio
 * spec: Design / Runtime / Evaluation / Release.
 */
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  IdCard,
  Brain,
  MessageSquare,
  Wrench,
  BookOpen,
  Database,
  Workflow,
  ShieldCheck,
  Activity,
  PlayCircle,
  FlaskConical,
  GitBranch,
  Rocket,
  FileStack,
  Bot,
  Cpu,
  Webhook,
  Plug,
  Users,
  Library,
  Store,
  Network,
  ScanSearch,
  Folder,
  Globe,
  LayoutGrid,
  Radio,
} from "lucide-react";

export type AgentStudioView =
  | "home"
  | "new"
  | "overview"
  | "identity"
  | "behavior"
  | "prompts"
  | "tools"
  | "knowledge"
  | "memory"
  | "workflows"
  | "governance"
  | "runs"
  | "chat"
  | "simulation"
  | "testing"
  | "versions"
  | "publish"
  // ── Phase 0d-f: openllm-agent2 native parity views ──
  | "runtime"
  | "hooks"
  | "mcp"
  | "subagents"
  // ── Plan v3 Phase 14: provider/model binding picker ──
  | "binding"
  // ── RAC P11: capability pack + RAC config + traces ──
  | "rac"
  // ── Retrofit P12: Universal KB / Tool Knowledge / Approvals ──
  | "retrofit"
  // ── Phase 13e: Catalog (global, no agent context) ──
  | "catalog-skills"
  | "catalog-tools"
  // ── Phase 14c: Marketplace (global, no agent context) ──
  | "marketplace"
  // ── Phase 19 follow-up: Global MCP Manager (no agent context) ──
  | "mcp-manager"
  // ── V1+ 15-δ slice (PR-V1-84): Vault Attachments admin ──
  | "vault-attachments"
  // ── V1+ 16-δ slice (PR-V1-85): Vault Saved Views admin ──
  | "vault-saved-views"
  // ── V1+ 17-γ slice (PR-V1-86): Canvas projection events drain ──
  | "canvas-projection-events-drain"
  // ── V2 Phase MR-1 Phase-2 (PR-V1-157): region admin ──
  | "region-admin"
  // ── V1+ Phase 18 follow-up (PR-V1-163): extensions admin ──
  | "extensions-admin"
  // ── V1+ Phase 17 closure (PR-V1-171): canvas operator browser ──
  | "canvas-operator"
  // ── PR-V1-184: approval-bus admin ──
  | "approval-bus-admin";

interface SectionGroup {
  label: string;
  items: { key: AgentStudioView; label: string; icon: React.ElementType }[];
}

const HOME_GROUPS: SectionGroup[] = [
  {
    label: "Studio",
    items: [
      { key: "home", label: "All Agents", icon: LayoutDashboard },
      { key: "new", label: "New Agent", icon: Bot },
    ],
  },
  // ── Phase 13e: global catalog pages ──
  {
    label: "Catalog",
    items: [
      { key: "catalog-skills", label: "Skills Catalog", icon: Library },
      { key: "catalog-tools", label: "Tools Catalog", icon: Wrench },
    ],
  },
  // ── Phase 14c: global marketplace ──
  {
    label: "Marketplace",
    items: [
      { key: "marketplace", label: "Browse / Install", icon: Store },
    ],
  },
  // ── Phase 19 follow-up: Global MCP Manager — cross-draft FSM /
  // registry visibility surfaced from the dispatcher / FSM / registry
  // chokepoint architecture shipped in Phase 19a/b/c.
  {
    label: "MCP",
    items: [
      { key: "mcp-manager", label: "MCP Manager", icon: Network },
    ],
  },
  // ── V1+ 15-δ slice (PR-V1-84) + 16-δ slice (PR-V1-85): Vault
  // admin entries. Reach /agent-studio/vault-attachments and
  // /agent-studio/vault-saved-views; PRs #834 + #836 wire the URL
  // parser + render cases in the Shell.
  {
    label: "Vaults",
    items: [
      { key: "vault-attachments", label: "Attachments", icon: Folder },
      { key: "vault-saved-views", label: "Saved Views", icon: GitBranch },
    ],
  },
  // ── V1+ 17-γ slice (PR-V1-86): Canvas projection events drain
  // operator observability page. Reaches
  // /agent-studio/canvas-projection-events-drain. Phase 17 closure
  // (PR-V1-171) adds the canvas operator browser too.
  {
    label: "Canvas",
    items: [
      {
        key: "canvas-operator",
        label: "Operator Browser",
        icon: LayoutGrid,
      },
      {
        key: "canvas-projection-events-drain",
        label: "Projection Drain",
        icon: Activity,
      },
    ],
  },
  // ── V1+ Phase 18 follow-up (PR-V1-163): extensions admin ──
  {
    label: "Extensions",
    items: [
      { key: "extensions-admin", label: "Installed", icon: Plug },
    ],
  },
  // ── V2 Phase MR-1 Phase-2 (PR-V1-157): region admin ──
  {
    label: "Multi-region",
    items: [
      { key: "region-admin", label: "Region Admin", icon: Globe },
    ],
  },
  // ── PR-V1-184: approval-bus admin ──
  {
    label: "Approval bus",
    items: [
      { key: "approval-bus-admin", label: "Pubsub Status", icon: Radio },
    ],
  },
];

const AGENT_GROUPS: SectionGroup[] = [
  {
    label: "Design",
    items: [
      { key: "overview", label: "Overview", icon: LayoutDashboard },
      { key: "identity", label: "Identity", icon: IdCard },
      { key: "behavior", label: "Behavior", icon: Brain },
      { key: "prompts", label: "Prompts", icon: MessageSquare },
      { key: "tools", label: "Tools", icon: Wrench },
      { key: "knowledge", label: "Knowledge", icon: BookOpen },
      { key: "memory", label: "Memory", icon: Database },
      { key: "workflows", label: "Workflows", icon: Workflow },
      // Phase 0d: Runtime config (provider/model/effort/maxTurns/etc)
      { key: "runtime", label: "Runtime", icon: Cpu },
      // Plan v3 Phase 14: Bind to AI Types Catalog
      { key: "binding", label: "Provider Binding", icon: Cpu },
      // Phase 0e: Hooks / MCP / Subagents (pages land in 0e)
      { key: "hooks", label: "Hooks", icon: Webhook },
      { key: "mcp", label: "MCP Servers", icon: Plug },
      { key: "subagents", label: "Subagents", icon: Users },
    ],
  },
  {
    label: "Runtime",
    items: [
      { key: "governance", label: "Governance", icon: ShieldCheck },
      { key: "runs", label: "Runs / Traces", icon: Activity },
      // RAC P11 — capability pack + retrieval-augmented context configuration.
      { key: "rac", label: "RAC", icon: ScanSearch },
      // Retrofit P12 — Universal KB / Tool Knowledge / Approvals queue.
      { key: "retrofit", label: "Retrofit", icon: BookOpen },
    ],
  },
  {
    label: "Interact",
    items: [
      // Phase 19 follow-up: multi-turn chat with the agent, like the
      // OpenCode chat view. Uses the same direct OpenAI adapter as
      // Simulation but accumulates message history in asdb.
      { key: "chat", label: "Chat", icon: MessageSquare },
    ],
  },
  {
    label: "Evaluation",
    items: [
      { key: "simulation", label: "Simulation", icon: PlayCircle },
      { key: "testing", label: "Testing", icon: FlaskConical },
    ],
  },
  {
    label: "Release",
    items: [
      { key: "versions", label: "Versions", icon: GitBranch },
      { key: "publish", label: "Publish / Deploy", icon: Rocket },
    ],
  },
];

interface Props {
  active: AgentStudioView;
  onNavigate: (key: AgentStudioView) => void;
  collapsed: boolean;
  onToggle: () => void;
  /** When set, shows the agent-detail nav groups; otherwise shows home nav */
  agentContext: boolean;
  agentName?: string;
}

export default function AgentStudioSidebar({
  active,
  onNavigate,
  collapsed,
  onToggle,
  agentContext,
  agentName,
}: Props) {
  const groups = agentContext ? AGENT_GROUPS : HOME_GROUPS;

  return (
    <div
      className={cn(
        "border-r bg-background flex flex-col h-full transition-all duration-200 shrink-0",
        collapsed ? "w-12" : "w-56"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center border-b",
          collapsed ? "justify-center py-2" : "justify-between px-2 py-2"
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0" title={agentName}>
            <div className="h-5 w-5 rounded-sm bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
              <Bot className="h-3 w-3 text-blue-400" />
            </div>
            <span className="text-xs font-semibold text-foreground truncate">
              {agentName ?? "Agent Studio"}
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Nav */}
      <div className={cn("flex-1 min-h-0 overflow-y-auto", collapsed ? "px-1 py-1" : "py-2")}>
        {groups.map((group, groupIdx) => (
          <div
            key={group.label}
            className={cn(
              "mb-1",
              !collapsed && groupIdx > 0 && "border-t border-border/50 pt-2 mt-2"
            )}
          >
            {!collapsed && (
              <div className="px-3 pb-1 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60">
                {group.label}
              </div>
            )}
            <div className={cn(collapsed ? "" : "px-1")}>
              {group.items.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => onNavigate(key)}
                  title={label}
                  className={cn(
                    "flex items-center w-full rounded transition-colors relative",
                    collapsed ? "justify-center py-1.5 mx-auto" : "gap-2 px-2 py-1.5 text-xs",
                    active === key
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  )}
                >
                  {/* Active indicator bar */}
                  {active === key && !collapsed && (
                    <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-primary" />
                  )}
                  <Icon
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      active === key ? "opacity-100" : "opacity-60"
                    )}
                  />
                  {!collapsed && <span className="truncate">{label}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
