/**
 * OpenCode Settings Rail — S2 sidebar in the Double IBM Shell pattern.
 *
 * Has its own collapse toggle, independent from S1 (CodeStudioSidebar).
 * Collapsed: icon-only (w-12). Expanded: full labels (w-44).
 */
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Settings2,
  Cpu,
  Server,
  Plug,
  Bot,
  Shield,
  Terminal,
  FileCode,
  Braces,
  ScrollText,
  Palette,
  FlaskConical,
  Heart,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

export type SettingsSection =
  | "overview"
  | "runtime"
  | "server"
  | "providers"
  | "agents"
  | "permissions"
  | "commands"
  | "formatters"
  | "mcp-plugins"
  | "instructions"
  | "tui"
  | "advanced"
  | "status";

const SECTIONS: { key: SettingsSection; label: string; icon: React.ElementType }[] = [
  { key: "overview", label: "Overview", icon: Settings2 },
  { key: "runtime", label: "Runtime", icon: Cpu },
  { key: "server", label: "Server", icon: Server },
  { key: "providers", label: "Providers & Models", icon: Plug },
  { key: "agents", label: "Agents", icon: Bot },
  { key: "permissions", label: "Permissions", icon: Shield },
  { key: "commands", label: "Commands", icon: Terminal },
  { key: "formatters", label: "Formatters", icon: FileCode },
  { key: "mcp-plugins", label: "MCP & Plugins", icon: Braces },
  { key: "instructions", label: "Instructions", icon: ScrollText },
  { key: "tui", label: "TUI", icon: Palette },
  { key: "advanced", label: "Advanced", icon: FlaskConical },
  { key: "status", label: "Runtime Status", icon: Heart },
];

interface Props {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  activeTab: "runtime" | "tui";
  dirty?: boolean;
  collapsed: boolean;
  onToggle: () => void;
}

export default function OpenCodeSettingsRail({
  activeSection,
  onSectionChange,
  activeTab,
  dirty,
  collapsed,
  onToggle,
}: Props) {
  return (
    <div
      className={cn(
        "border-r bg-background flex flex-col h-full shrink-0 transition-all duration-200",
        collapsed ? "w-12" : "w-44",
      )}
    >
      {/* S2 header */}
      <div
        className={cn(
          "flex items-center border-b min-h-[2.125rem]",
          collapsed ? "justify-center py-1.5" : "justify-between px-2 py-1.5",
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-semibold text-muted-foreground truncate">
              OpenCode
            </span>
            <Badge variant="outline" className="text-[9px] px-1 h-4">
              {activeTab === "runtime" ? "Runtime" : "TUI"}
            </Badge>
            {dirty && (
              <Badge variant="secondary" className="text-[9px] px-1 h-4">
                Unsaved
              </Badge>
            )}
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

      {/* Section nav */}
      <ScrollArea className="flex-1">
        <div className={collapsed ? "px-1 py-1" : "py-1"}>
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onSectionChange(key)}
              title={label}
              className={cn(
                "flex items-center w-full rounded-sm transition-colors",
                collapsed ? "justify-center py-1.5" : "gap-2 px-3 py-1.5 text-xs",
                activeSection === key
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <Icon className="h-3 w-3 shrink-0 opacity-70" />
              {!collapsed && <span className="truncate">{label}</span>}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
