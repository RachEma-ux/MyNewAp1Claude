/**
 * WorkspaceToolsSidebar — Collapsible right sidebar for workspace tools
 *
 * Vertical tool navigation panel on the left side (after context sidebar).
 * Answers: "What tools can I use here?"
 *
 * Desktop: inline collapsible panel (220px open, icon-only 48px collapsed)
 * Mobile: slide-out drawer from the left
 *
 * Visual signals:
 *   - "TOOLS" header with toggle
 *   - Vertical list of tool links with icons + labels
 *   - Active tool highlighted with primary fill
 *   - Priority tools have accent ring
 *   - Grouped with visual separators
 */

import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import {
  Package,
  Users,
  Bot,
  FileText,
  MessageSquare,
  GitBranch,
  FolderKanban,
  BookOpen,
  Shield,
  BarChart3,
  ShieldCheck,
  Wrench,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { ShellViewData } from "./types";

interface ToolsSidebarProps {
  shell: ShellViewData;
  basePath: string;
  open: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onClose: () => void;
}

const TOOL_DOMAINS: Record<string, {
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  path: string;
}> = {
  resources: {
    label: "Resources",
    shortLabel: "Resources",
    icon: <Package className="h-4 w-4" />,
    path: "resources",
  },
  team: {
    label: "Team",
    shortLabel: "Team",
    icon: <Users className="h-4 w-4" />,
    path: "team",
  },
  crew: {
    label: "AI Crew",
    shortLabel: "Crew",
    icon: <Bot className="h-4 w-4" />,
    path: "crew",
  },
  documents: {
    label: "Documents",
    shortLabel: "Docs",
    icon: <FileText className="h-4 w-4" />,
    path: "knowledge",
  },
  collaboration: {
    label: "Collaboration",
    shortLabel: "Collab",
    icon: <MessageSquare className="h-4 w-4" />,
    path: "collaboration",
  },
  "workflow-designer": {
    label: "Workflow Designer",
    shortLabel: "Workflows",
    icon: <GitBranch className="h-4 w-4" />,
    path: "workflows",
  },
  "pm-toolbox": {
    label: "PM Toolbox",
    shortLabel: "PM",
    icon: <FolderKanban className="h-4 w-4" />,
    path: "projects",
  },
  knowledge: {
    label: "Knowledge Base",
    shortLabel: "Knowledge",
    icon: <BookOpen className="h-4 w-4" />,
    path: "knowledge",
  },
  rules: {
    label: "Rules & Regulations",
    shortLabel: "Rules",
    icon: <Shield className="h-4 w-4" />,
    path: "rules",
  },
};

/* ─── Single tool link ─── */
function ToolLink({
  href,
  icon,
  label,
  isActive,
  isPriority,
  collapsed,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  isPriority?: boolean;
  collapsed: boolean;
}) {
  const inner = (
    <Link href={href}>
      <button
        className={cn(
          "flex items-center gap-2.5 w-full rounded-md text-sm transition-colors",
          collapsed ? "justify-center px-2 py-2" : "px-3 py-2",
          isActive
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
          isPriority && !isActive && "ring-1 ring-primary/40 text-foreground"
        )}
      >
        <span className="shrink-0">{icon}</span>
        {!collapsed && <span className="truncate">{label}</span>}
      </button>
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return inner;
}

/* ─── Sidebar content ─── */
function SidebarContent({
  shell,
  basePath,
  collapsed,
  onToggle,
}: {
  shell: ShellViewData;
  basePath: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [location] = useLocation();
  const prioritySet = new Set(shell.toolbar.priorityItems);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={cn(
        "flex items-center shrink-0 border-b px-2 py-2",
        collapsed ? "justify-center" : "justify-between"
      )}>
        {!collapsed && (
          <div className="flex items-center gap-1.5 pl-1">
            <Wrench className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
              Tools
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onToggle}
          title={collapsed ? "Expand tools panel" : "Collapse tools panel"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Tool links */}
      <ScrollArea className="flex-1">
        <div className={cn("space-y-0.5 py-2", collapsed ? "px-1.5" : "px-2")}>
          {/* Overview */}
          <ToolLink
            href={basePath}
            icon={<LayoutDashboard className="h-4 w-4" />}
            label="Overview"
            isActive={location === basePath || location === basePath + "/"}
            collapsed={collapsed}
          />

          {/* Separator */}
          <div className={cn("my-1.5", collapsed ? "mx-1 border-t" : "mx-2 border-t")} />

          {/* Dynamic tool domains */}
          {shell.toolbar.visibleItems.map((key) => {
            const tool = TOOL_DOMAINS[key];
            if (!tool) return null;

            const fullPath = `${basePath}/${tool.path}`;
            const isActive = location.startsWith(fullPath);
            const isPriority = prioritySet.has(key);

            return (
              <ToolLink
                key={key}
                href={fullPath}
                icon={tool.icon}
                label={collapsed ? tool.shortLabel : tool.label}
                isActive={isActive}
                isPriority={isPriority}
                collapsed={collapsed}
              />
            );
          })}

          {/* Separator */}
          <div className={cn("my-1.5", collapsed ? "mx-1 border-t" : "mx-2 border-t")} />

          {/* Always-visible: Governance + Reports */}
          <ToolLink
            href={`${basePath}/governance`}
            icon={<ShieldCheck className="h-4 w-4" />}
            label="Governance"
            isActive={location.startsWith(`${basePath}/governance`)}
            collapsed={collapsed}
          />
          <ToolLink
            href={`${basePath}/reports`}
            icon={<BarChart3 className="h-4 w-4" />}
            label="Reports"
            isActive={location.startsWith(`${basePath}/reports`)}
            collapsed={collapsed}
          />
        </div>
      </ScrollArea>
    </div>
  );
}

export function WorkspaceToolsToolbar({
  shell,
  basePath,
  open,
  collapsed,
  onToggle,
  onClose,
}: ToolsSidebarProps) {
  return (
    <>
      {/* Desktop: inline panel, full height of main area */}
      <aside
        className={cn(
          "hidden md:flex flex-col h-full border-r bg-card/80 backdrop-blur-sm transition-all duration-200 shrink-0 overflow-hidden",
          collapsed ? "w-[48px]" : "w-[220px]"
        )}
      >
        <SidebarContent
          shell={shell}
          basePath={basePath}
          collapsed={collapsed}
          onToggle={onToggle}
        />
      </aside>

      {/* Mobile: drawer from left */}
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="left" className="w-[260px] p-0 md:hidden">
          <SidebarContent
            shell={shell}
            basePath={basePath}
            collapsed={false}
            onToggle={onClose}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
