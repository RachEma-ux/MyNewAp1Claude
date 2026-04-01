/**
 * PS Control Panel — Sidebar
 *
 * Cloned from PSIdeationWorkflowRail / PM Central shell pattern.
 * 11 nav items in 5 logical sections, icon-only collapsed (w-12) / full expanded (w-56).
 * No cross-module imports — clone only.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  List,
  Upload,
  Target,
  FileQuestion,
  Layers,
  Grid3X3,
  Shield,
  BarChart3,
  CheckCircle2,
  TrendingUp,
  Settings2,
} from "lucide-react";

export type ControlPanelView =
  | "overview"
  | "versions"
  | "import"
  | "scopes"
  | "questions"
  | "dimensions"
  | "grid"
  | "validation"
  | "monitoring"
  | "queue"
  | "ideation";

interface NavItemDef {
  key: ControlPanelView;
  label: string;
  icon: React.ReactNode;
}

const NAV_SECTIONS: { label: string; items: NavItemDef[] }[] = [
  {
    label: "Matrix",
    items: [
      { key: "overview", label: "Overview", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
      { key: "versions", label: "Versions", icon: <List className="h-3.5 w-3.5" /> },
      { key: "grid", label: "Grid", icon: <Grid3X3 className="h-3.5 w-3.5" /> },
    ],
  },
  {
    label: "Content",
    items: [
      { key: "scopes", label: "Scopes", icon: <Target className="h-3.5 w-3.5" /> },
      { key: "questions", label: "Questions", icon: <FileQuestion className="h-3.5 w-3.5" /> },
      { key: "dimensions", label: "Dimensions", icon: <Layers className="h-3.5 w-3.5" /> },
    ],
  },
  {
    label: "Data",
    items: [
      { key: "import", label: "Import", icon: <Upload className="h-3.5 w-3.5" /> },
    ],
  },
  {
    label: "Quality",
    items: [
      { key: "validation", label: "Validation", icon: <Shield className="h-3.5 w-3.5" /> },
      { key: "queue", label: "Queue", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    ],
  },
  {
    label: "Analytics",
    items: [
      { key: "monitoring", label: "Monitoring", icon: <BarChart3 className="h-3.5 w-3.5" /> },
      { key: "ideation", label: "Ideation", icon: <TrendingUp className="h-3.5 w-3.5" /> },
    ],
  },
];

interface Props {
  activeView: ControlPanelView;
  onViewSelect: (view: ControlPanelView) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

// ── NavSection (matches PM Central NavSection) ────────────────────────────────

function NavSection({
  label,
  children,
  defaultOpen = true,
  collapsed,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (collapsed) {
    return <div className="py-1">{children}</div>;
  }

  return (
    <div className="py-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <div className="flex items-center gap-1">
          {open ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
          {label}
        </div>
      </button>
      {open && <div className="mt-0.5">{children}</div>}
    </div>
  );
}

// ── NavItem (matches PM Central NavItem) ──────────────────────────────────────

function NavItem({
  icon,
  label,
  active,
  collapsed,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  onClick: () => void;
}) {
  if (collapsed) {
    return (
      <button
        onClick={onClick}
        title={label}
        className={cn(
          "flex items-center justify-center w-full py-1.5 rounded-sm transition-colors",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        )}
      >
        <span className="opacity-70">{icon}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-sm transition-colors",
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
      )}
    >
      <span className="shrink-0 opacity-70">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function PSControlPanelSidebar({
  activeView,
  onViewSelect,
  collapsed,
  onToggleCollapse,
}: Props) {
  return (
    <div
      className={cn(
        "border-r bg-background flex flex-col h-full transition-all duration-200 shrink-0",
        collapsed ? "w-12" : "w-56",
      )}
    >
      {/* Toggle header — matches PM Central */}
      <div
        className={cn(
          "flex items-center border-b",
          collapsed ? "justify-center py-1.5" : "justify-between px-2 py-1.5",
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <Settings2 className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
            <span className="text-xs font-semibold text-muted-foreground truncate">
              Control Panel
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Scrollable nav */}
      <ScrollArea className="flex-1">
        <div className={collapsed ? "px-1" : ""}>
          {NAV_SECTIONS.map((section) => (
            <NavSection key={section.label} label={section.label} collapsed={collapsed}>
              {section.items.map((item) => (
                <NavItem
                  key={item.key}
                  icon={item.icon}
                  label={item.label}
                  active={activeView === item.key}
                  collapsed={collapsed}
                  onClick={() => onViewSelect(item.key)}
                />
              ))}
            </NavSection>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
