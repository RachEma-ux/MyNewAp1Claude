/**
 * WorkspaceToolbar — Action layer for workspace operations
 *
 * Contains: Resources, Team, Crew, Documents, Collaboration Tools,
 * Workflow Designer, PM Toolbox, Knowledge, Rules & Regulations
 */

import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Settings,
  Eye,
} from "lucide-react";

interface ToolbarProps {
  workspaceId: number;
  visibleItems: string[];
  priorityItems: string[];
  isManager: boolean;
  enabledModules: string[];
}

const TOOLBAR_ITEMS: Record<string, { label: string; icon: React.ReactNode; path: string }> = {
  resources: { label: "Resources", icon: <Package className="h-4 w-4" />, path: "resources" },
  team: { label: "Team", icon: <Users className="h-4 w-4" />, path: "team" },
  crew: { label: "Crew", icon: <Bot className="h-4 w-4" />, path: "crew" },
  documents: { label: "Documents", icon: <FileText className="h-4 w-4" />, path: "knowledge" },
  collaboration: { label: "Collaboration", icon: <MessageSquare className="h-4 w-4" />, path: "collaboration" },
  "workflow-designer": { label: "Workflows", icon: <GitBranch className="h-4 w-4" />, path: "workflows" },
  "pm-toolbox": { label: "PM Toolbox", icon: <FolderKanban className="h-4 w-4" />, path: "projects" },
  knowledge: { label: "Knowledge", icon: <BookOpen className="h-4 w-4" />, path: "knowledge" },
  rules: { label: "Rules", icon: <Shield className="h-4 w-4" />, path: "rules" },
};

export function WorkspaceToolbar({
  workspaceId,
  visibleItems,
  priorityItems,
  isManager,
  enabledModules,
}: ToolbarProps) {
  const [location] = useLocation();
  const base = `/w/${workspaceId}`;
  const prioritySet = new Set(priorityItems);

  return (
    <div className="border-b bg-background/95 backdrop-blur">
      <div className="flex items-center gap-1 px-3 py-1.5 overflow-x-auto">
        {visibleItems.map((key) => {
          const item = TOOLBAR_ITEMS[key];
          if (!item) return null;

          const fullPath = `${base}/${item.path}`;
          const isActive = location.startsWith(fullPath);
          const isPriority = prioritySet.has(key);

          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <Link href={fullPath}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    size="sm"
                    className={cn(
                      "text-xs gap-1.5 whitespace-nowrap",
                      isPriority && !isActive && "border border-primary/30"
                    )}
                  >
                    {item.icon}
                    <span className="hidden sm:inline">{item.label}</span>
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent>{item.label}</TooltipContent>
            </Tooltip>
          );
        })}

        {/* Manager-only controls */}
        {isManager && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={`${base}/settings`}>
                  <Button variant="ghost" size="sm" className="text-xs gap-1.5">
                    <Settings className="h-4 w-4" />
                    <span className="hidden sm:inline">Configure</span>
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent>Workspace Configuration</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={`${base}/visibility`}>
                  <Button variant="ghost" size="sm" className="text-xs gap-1.5">
                    <Eye className="h-4 w-4" />
                    <span className="hidden sm:inline">Visibility</span>
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent>Manage Participant Visibility</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
}
