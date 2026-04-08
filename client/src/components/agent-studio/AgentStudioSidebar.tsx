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
  | "simulation"
  | "testing"
  | "versions"
  | "publish";

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
    ],
  },
  {
    label: "Runtime",
    items: [
      { key: "governance", label: "Governance", icon: ShieldCheck },
      { key: "runs", label: "Runs / Traces", icon: Activity },
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
