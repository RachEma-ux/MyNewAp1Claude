/**
 * WorkspaceToolsToolbar — Visually distinct TOOLS layer (NOT navigation)
 *
 * This is SEPARATE from the context sidebar and visually reads as a labeled
 * tool palette, not a nav rail. It answers: "What tools can I use here?"
 *
 * Key visual signals:
 *   - Labeled "TOOLS" header on the left edge
 *   - Filled/outlined pill buttons (not ghost nav links)
 *   - Grouped by category with visible separators
 *   - Priority tools have accent ring
 *   - Manager tools visually distinct (orange tint)
 *
 * Desktop: horizontal bar below the header
 * Mobile: horizontally scrollable with condensed labels
 */

import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
} from "lucide-react";
import type { ShellViewData } from "./types";

interface ToolsToolbarProps {
  shell: ShellViewData;
  basePath: string;
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
    icon: <Package className="h-3.5 w-3.5" />,
    path: "resources",
  },
  team: {
    label: "Team",
    shortLabel: "Team",
    icon: <Users className="h-3.5 w-3.5" />,
    path: "team",
  },
  crew: {
    label: "AI Crew",
    shortLabel: "Crew",
    icon: <Bot className="h-3.5 w-3.5" />,
    path: "crew",
  },
  documents: {
    label: "Documents",
    shortLabel: "Docs",
    icon: <FileText className="h-3.5 w-3.5" />,
    path: "knowledge",
  },
  collaboration: {
    label: "Collaboration",
    shortLabel: "Collab",
    icon: <MessageSquare className="h-3.5 w-3.5" />,
    path: "collaboration",
  },
  "workflow-designer": {
    label: "Workflow Designer",
    shortLabel: "Workflows",
    icon: <GitBranch className="h-3.5 w-3.5" />,
    path: "workflows",
  },
  "pm-toolbox": {
    label: "PM Toolbox",
    shortLabel: "PM",
    icon: <FolderKanban className="h-3.5 w-3.5" />,
    path: "projects",
  },
  knowledge: {
    label: "Knowledge Base",
    shortLabel: "Knowledge",
    icon: <BookOpen className="h-3.5 w-3.5" />,
    path: "knowledge",
  },
  rules: {
    label: "Rules & Regulations",
    shortLabel: "Rules",
    icon: <Shield className="h-3.5 w-3.5" />,
    path: "rules",
  },
};

function ToolPill({
  href,
  icon,
  label,
  isActive,
  isPriority,
  className,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  isPriority?: boolean;
  className?: string;
}) {
  return (
    <Link href={href}>
      <button
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors",
          isActive
            ? "bg-primary text-primary-foreground shadow-sm"
            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
          isPriority && !isActive && "ring-1 ring-primary/40 text-foreground",
          className
        )}
      >
        {icon}
        {label}
      </button>
    </Link>
  );
}

export function WorkspaceToolsToolbar({ shell, basePath }: ToolsToolbarProps) {
  const [location] = useLocation();
  const prioritySet = new Set(shell.toolbar.priorityItems);

  return (
    <div className="border-b bg-card/50 shrink-0">
      <div className="flex items-center overflow-x-auto scrollbar-thin px-3 py-2 gap-2">
        {/* ── TOOLS label ── */}
        <div className="flex items-center gap-1 shrink-0 mr-1">
          <Wrench className="h-3 w-3 text-muted-foreground/60" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 hidden sm:inline">
            Tools
          </span>
        </div>

        <div className="w-px h-5 bg-border shrink-0" />

        {/* Overview */}
        <ToolPill
          href={basePath}
          icon={<LayoutDashboard className="h-3.5 w-3.5" />}
          label="Overview"
          isActive={location === basePath || location === basePath + "/"}
        />

        <div className="w-px h-5 bg-border shrink-0" />

        {/* Tool domain pills */}
        {shell.toolbar.visibleItems.map((key) => {
          const tool = TOOL_DOMAINS[key];
          if (!tool) return null;

          const fullPath = `${basePath}/${tool.path}`;
          const isActive = location.startsWith(fullPath);
          const isPriority = prioritySet.has(key);

          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <span>
                  <ToolPill
                    href={fullPath}
                    icon={tool.icon}
                    label={tool.shortLabel}
                    isActive={isActive}
                    isPriority={isPriority}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">{tool.label}</TooltipContent>
            </Tooltip>
          );
        })}

        <div className="w-px h-5 bg-border shrink-0" />

        {/* Always-visible: Governance + Reports */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <ToolPill
                href={`${basePath}/governance`}
                icon={<ShieldCheck className="h-3.5 w-3.5" />}
                label="Governance"
                isActive={location.startsWith(`${basePath}/governance`)}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Governance & Compliance</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <ToolPill
                href={`${basePath}/reports`}
                icon={<BarChart3 className="h-3.5 w-3.5" />}
                label="Reports"
                isActive={location.startsWith(`${basePath}/reports`)}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Reports & Analytics</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
