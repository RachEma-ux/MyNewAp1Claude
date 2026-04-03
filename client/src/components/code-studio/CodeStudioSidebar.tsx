/**
 * Code Studio Sidebar — S1 in the Double IBM Shell pattern.
 *
 * Also hosts the S2 (OpenCode Rail) toggle at the bottom,
 * so collapsing S2 hides it fully behind S1.
 */
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  LayoutDashboard,
  Workflow,
  Terminal,
  ShieldCheck,
  GitBranch,
  Users,
  Shield,
  Settings,
  Code2,
  BrainCircuit,
  BookOpen,
} from "lucide-react";

export type CodeStudioView =
  | "dashboard"
  | "jobs"
  | "sessions"
  | "approvals"
  | "repos"
  | "agents"
  | "policies"
  | "ai-catalog"
  | "control-panel"
  | "opencode-settings"
  | "how-to";

const NAV_ITEMS: { key: CodeStudioView; label: string; icon: React.ElementType }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "jobs", label: "Jobs", icon: Workflow },
  { key: "sessions", label: "Sessions", icon: Terminal },
  { key: "approvals", label: "Approvals", icon: ShieldCheck },
  { key: "repos", label: "Repositories", icon: GitBranch },
  { key: "agents", label: "Agents", icon: Users },
  { key: "ai-catalog", label: "AI Catalog", icon: BrainCircuit },
  { key: "policies", label: "Policies", icon: Shield },
  { key: "control-panel", label: "Control Panel", icon: Settings },
  { key: "opencode-settings", label: "OpenCode", icon: Code2 },
  { key: "how-to", label: "How To", icon: BookOpen },
];

interface Props {
  active: CodeStudioView;
  onNavigate: (key: CodeStudioView) => void;
  collapsed: boolean;
  onToggle: () => void;
  /** Show the S2 rail toggle at the bottom (only on opencode-settings page) */
  showRailToggle?: boolean;
  railCollapsed?: boolean;
  onRailToggle?: () => void;
}

export default function CodeStudioSidebar({
  active,
  onNavigate,
  collapsed,
  onToggle,
  showRailToggle,
  railCollapsed,
  onRailToggle,
}: Props) {
  return (
    <div
      className={cn(
        "border-r bg-background flex flex-col h-full transition-all duration-200 shrink-0",
        collapsed ? "w-12" : "w-56"
      )}
    >
      {/* Header with S1 toggle */}
      <div
        className={cn(
          "flex items-center border-b",
          collapsed ? "justify-center py-1.5" : "justify-between px-2 py-1.5"
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <Code2 className="h-3.5 w-3.5 shrink-0 text-violet-500" />
            <span className="text-xs font-semibold text-muted-foreground truncate">
              Code Studio
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          onClick={onToggle}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Nav items */}
      <div className={cn("flex-1 min-h-0 overflow-y-auto", collapsed ? "px-1 py-1" : "")}>
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onNavigate(key)}
            title={label}
            className={cn(
              "flex items-center w-full rounded-sm transition-colors",
              collapsed ? "justify-center py-1.5" : "gap-2 px-3 py-1.5 text-xs",
              active === key
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
            {!collapsed && <span className="truncate">{label}</span>}
          </button>
        ))}
      </div>

      {/* S2 rail toggle — pinned at bottom, only on opencode-settings */}
      {showRailToggle && (
        <div className={cn("border-t", collapsed ? "flex justify-center py-1.5" : "px-2 py-1.5")}>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "shrink-0",
              collapsed ? "h-7 w-7 p-0" : "h-7 w-full justify-start gap-2 px-2 text-xs text-muted-foreground hover:text-foreground"
            )}
            onClick={onRailToggle}
            title={railCollapsed ? "Show Settings panel" : "Hide Settings panel"}
          >
            {railCollapsed ? (
              <>
                <PanelRightOpen className="h-3.5 w-3.5 shrink-0" />
                {!collapsed && <span className="truncate">Show Settings</span>}
              </>
            ) : (
              <>
                <PanelRightClose className="h-3.5 w-3.5 shrink-0" />
                {!collapsed && <span className="truncate">Hide Settings</span>}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
