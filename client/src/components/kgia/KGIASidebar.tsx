import { useLocation, Link } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Search,
  Database,
  FlaskConical,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  BrainCircuit,
} from "lucide-react";

export type KGIAView = "workbench" | "sources" | "benchmarks" | "governance";

interface KGIASidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeView: KGIAView;
}

const navGroups = [
  {
    label: "Workspace",
    items: [
      { view: "workbench" as const, label: "Workbench", icon: Search, href: "/kgia" },
      { view: "sources" as const, label: "Sources", icon: Database, href: "/kgia/sources" },
    ],
  },
  {
    label: "Evaluation",
    items: [
      { view: "benchmarks" as const, label: "Benchmarks", icon: FlaskConical, href: "/kgia/benchmarks" },
      { view: "governance" as const, label: "Governance", icon: ShieldCheck, href: "/kgia/governance" },
    ],
  },
];

export default function KGIASidebar({ collapsed, onToggle, activeView }: KGIASidebarProps) {
  return (
    <div
      className={cn(
        "flex flex-col border-r border-border bg-card transition-all duration-200 shrink-0",
        collapsed ? "w-12" : "w-56"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-12 border-b border-border shrink-0">
        <BrainCircuit className="w-5 h-5 text-primary shrink-0" />
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight truncate">KGIA</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-6 w-6 shrink-0"
          onClick={onToggle}
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-2 space-y-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <div className="px-3 mb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5 px-1.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.view;
                return (
                  <Link key={item.view} href={item.href}>
                    <button
                      className={cn(
                        "flex items-center gap-2.5 w-full rounded-md text-sm transition-colors",
                        collapsed ? "justify-center px-0 py-2" : "px-2.5 py-1.5",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                      title={collapsed ? item.label : undefined}
                    >
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
