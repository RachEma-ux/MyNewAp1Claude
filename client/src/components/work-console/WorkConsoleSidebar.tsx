/**
 * AI Work Console — S1 Sidebar
 *
 * Primary module nav: Home (recent jobs + launch new), History (all
 * jobs), plus contextual deep-link shortcuts into Code Studio and
 * OpenCode for users who want to drop into the deeper surfaces.
 *
 * Pattern cloned from client/src/components/code-studio/CodeStudioSidebar.tsx
 * per the "clone only" rule. Same collapse-to-w12 behavior, same
 * button styling, same active-view indicator.
 */
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  History,
  Plus,
  Code2,
  MonitorPlay,
  Rocket,
} from "lucide-react";

export type WorkConsoleView =
  | "home"
  | "new"
  | "history"
  | "detail";

interface NavItem {
  key: WorkConsoleView | "deep-code-studio" | "deep-opencode";
  label: string;
  icon: React.ElementType;
  external?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Home", icon: LayoutDashboard },
  { key: "new", label: "New Intent", icon: Plus },
  { key: "history", label: "History", icon: History },
  { key: "deep-code-studio", label: "Code Studio", icon: Code2, external: true },
  { key: "deep-opencode", label: "OpenCode IDE", icon: MonitorPlay, external: true },
];

const OPENCODE_IDE_URL = "http://127.0.0.1:4096/";
const CODE_STUDIO_DASHBOARD_URL = "/code-studio/dashboard";

interface Props {
  active: WorkConsoleView;
  onNavigate: (key: WorkConsoleView) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export default function WorkConsoleSidebar({
  active,
  onNavigate,
  collapsed,
  onToggle,
}: Props) {
  const handleClick = (item: NavItem) => {
    if (item.key === "deep-code-studio") {
      window.location.href = CODE_STUDIO_DASHBOARD_URL;
      return;
    }
    if (item.key === "deep-opencode") {
      window.open(OPENCODE_IDE_URL, "_blank");
      return;
    }
    onNavigate(item.key as WorkConsoleView);
  };

  return (
    <div
      className={cn(
        "border-r bg-background flex flex-col h-full transition-all duration-200 shrink-0",
        collapsed ? "w-12" : "w-56"
      )}
    >
      {/* Header with collapse toggle */}
      <div
        className={cn(
          "flex items-center border-b",
          collapsed ? "justify-center py-1.5" : "justify-between px-2 py-1.5"
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <Rocket className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            <span className="text-xs font-semibold text-muted-foreground truncate">
              AI Work Console
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
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = !item.external && active === item.key;
          return (
            <button
              key={item.key}
              onClick={() => handleClick(item)}
              title={item.label}
              className={cn(
                "flex items-center w-full rounded-sm transition-colors",
                collapsed ? "justify-center py-1.5" : "gap-2 px-3 py-1.5 text-xs",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                item.external && !collapsed && "border-t mt-2 pt-2"
              )}
            >
              <Icon className={cn("h-3.5 w-3.5 shrink-0 opacity-70", isActive && "opacity-100")} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
