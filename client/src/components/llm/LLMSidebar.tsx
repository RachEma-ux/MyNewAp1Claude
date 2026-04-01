/**
 * LLM Sidebar — Simple IBM Shell sidebar
 */
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  Settings,
  FileStack,
  Wand2,
  List,
  Database,
  BookOpen,
} from "lucide-react";

export type LLMView = "dashboard" | "control-panel" | "register" | "wizard" | "list" | "catalogue";

const NAV_ITEMS: { key: LLMView; label: string; icon: React.ElementType }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "control-panel", label: "Control Panel", icon: Settings },
  { key: "register", label: "LLM Register", icon: FileStack },
  { key: "wizard", label: "LLM Wizard", icon: Wand2 },
  { key: "list", label: "LLMs List", icon: List },
  { key: "catalogue", label: "Catalogue", icon: BookOpen },
];

interface Props {
  active: LLMView;
  onNavigate: (key: LLMView) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export default function LLMSidebar({ active, onNavigate, collapsed, onToggle }: Props) {
  return (
    <div
      className={cn(
        "border-r bg-background flex flex-col h-full transition-all duration-200 shrink-0",
        collapsed ? "w-12" : "w-56",
      )}
    >
      <div className={cn("flex items-center border-b", collapsed ? "justify-center py-1.5" : "justify-between px-2 py-1.5")}>
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <Database className="h-3.5 w-3.5 shrink-0 text-purple-500" />
            <span className="text-xs font-semibold text-muted-foreground truncate">LLMs</span>
          </div>
        )}
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={onToggle} title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className={collapsed ? "px-1 py-1" : ""}>
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
  );
}
