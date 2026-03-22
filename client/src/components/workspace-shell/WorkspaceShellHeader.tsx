/**
 * WorkspaceShellHeader — Top bar of the new workspace execution shell
 *
 * Shows workspace identity, status, quick context, and mobile toggle controls.
 * NOT the old thin title bar — this communicates workspace meaning.
 */

import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";

interface ShellHeaderProps {
  workspaceName: string;
  workspaceType: string | null;
  status: string;
  isManager: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onManagerOpen: () => void;
  onToolsToggle: () => void;
  basePath: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  ready_for_review: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  under_review: "bg-purple-500/15 text-purple-600 border-purple-500/30",
  approved: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  published: "bg-cyan-500/15 text-cyan-600 border-cyan-500/30",
  active: "bg-green-500/15 text-green-600 border-green-500/30",
  rejected: "bg-red-500/15 text-red-600 border-red-500/30",
  archived: "bg-gray-500/15 text-gray-500 border-gray-500/30",
};

export function WorkspaceShellHeader({
  workspaceName,
  workspaceType,
  status,
  isManager,
  sidebarOpen,
  onToggleSidebar,
  onManagerOpen,
  onToolsToggle,
  basePath,
}: ShellHeaderProps) {
  return (
    <header className="flex items-center gap-3 px-3 py-2 border-b bg-card shrink-0 min-h-[48px]">
      {/* Sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onToggleSidebar}
        title={sidebarOpen ? "Close context panel" : "Open context panel"}
      >
        {sidebarOpen ? (
          <PanelLeftClose className="h-4 w-4" />
        ) : (
          <PanelLeftOpen className="h-4 w-4" />
        )}
      </Button>

      {/* Back to workspaces */}
      <Link href="/workspaces">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </Link>

      {/* Workspace identity */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <h1 className="text-sm font-semibold truncate">{workspaceName}</h1>
        {workspaceType && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
            {workspaceType}
          </Badge>
        )}
        <Badge
          variant="outline"
          className={cn("text-[10px] px-1.5 py-0 shrink-0", STATUS_COLORS[status])}
        >
          {status.replace(/_/g, " ")}
        </Badge>
      </div>

      {/* Mobile: tools sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 md:hidden"
        onClick={onToolsToggle}
        title="Toggle tools panel"
      >
        <Wrench className="h-4 w-4" />
      </Button>

      {/* Manager controls drawer trigger */}
      {isManager && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5 shrink-0 text-orange-600 border-orange-500/30 hover:bg-orange-500/10"
          onClick={onManagerOpen}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Manager</span>
        </Button>
      )}
    </header>
  );
}
