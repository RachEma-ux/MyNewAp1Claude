import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Plug, Database, Route, Shield, FlaskConical,
  BarChart3, Activity, HeartPulse, ChevronLeft, ChevronRight, Zap,
} from "lucide-react";

export type OpenRouterView =
  | "home" | "connect" | "models" | "routing" | "guardrails"
  | "playground" | "usage" | "health" | "activity";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  activeView: OpenRouterView;
}

const navGroups = [
  {
    label: "Control Plane",
    items: [
      { view: "home" as const, label: "Overview", icon: LayoutDashboard, href: "/openrouter" },
      { view: "connect" as const, label: "Connect", icon: Plug, href: "/openrouter/connect" },
      { view: "models" as const, label: "Models", icon: Database, href: "/openrouter/models" },
      { view: "routing" as const, label: "Routing", icon: Route, href: "/openrouter/routing" },
    ],
  },
  {
    label: "Execution",
    items: [
      { view: "playground" as const, label: "Playground", icon: FlaskConical, href: "/openrouter/playground" },
      { view: "guardrails" as const, label: "Guardrails", icon: Shield, href: "/openrouter/guardrails" },
    ],
  },
  {
    label: "Operations",
    items: [
      { view: "usage" as const, label: "Usage", icon: BarChart3, href: "/openrouter/usage" },
      { view: "health" as const, label: "Health", icon: HeartPulse, href: "/openrouter/health" },
      { view: "activity" as const, label: "Activity", icon: Activity, href: "/openrouter/activity" },
    ],
  },
];

export default function OpenRouterSidebar({ collapsed, onToggle, activeView }: Props) {
  return (
    <div className={cn("flex flex-col border-r border-border bg-card transition-all duration-200 shrink-0", collapsed ? "w-12" : "w-56")}>
      <div className="flex items-center gap-2 px-3 h-12 border-b border-border shrink-0">
        <Zap className="w-5 h-5 text-orange-500 shrink-0" />
        {!collapsed && <span className="text-sm font-semibold tracking-tight truncate">OpenRouter</span>}
        <Button variant="ghost" size="icon" className="ml-auto h-6 w-6 shrink-0" onClick={onToggle}>
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto py-2 space-y-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <div className="px-3 mb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{group.label}</div>
            )}
            <div className="space-y-0.5 px-1.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.view;
                return (
                  <Link key={item.view} href={item.href}>
                    <button className={cn(
                      "flex items-center gap-2.5 w-full rounded-md text-sm transition-colors",
                      collapsed ? "justify-center px-0 py-2" : "px-2.5 py-1.5",
                      isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )} title={collapsed ? item.label : undefined}>
                      <Icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
