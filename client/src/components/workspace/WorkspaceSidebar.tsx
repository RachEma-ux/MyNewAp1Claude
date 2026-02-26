/**
 * WorkspaceSidebar — IBM-style collapsible sidebar
 *
 * Dynamically renders enabled modules from workspace_modules.
 * Collapsible between full (240px) and icon-only (48px) modes.
 */

import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FolderKanban,
  BookOpen,
  Bot,
  MessageSquare,
  BarChart3,
  ShieldCheck,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  Settings,
  Home,
  Shield,
} from "lucide-react";

interface SidebarProps {
  workspaceId: number;
  workspaceName: string;
  enabledModules: Set<string>;
  collapsed: boolean;
  onToggle: () => void;
  onOversightOpen: () => void;
}

interface NavEntry {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  always?: boolean;
  children?: { label: string; path: string }[];
}

export function WorkspaceSidebar({
  workspaceId,
  workspaceName,
  enabledModules,
  collapsed,
  onToggle,
  onOversightOpen,
}: SidebarProps) {
  const [location] = useLocation();
  const base = `/w/${workspaceId}`;

  /** Collapse sidebar when a nav item is clicked while expanded */
  const handleNav = () => {
    if (!collapsed) onToggle();
  };

  const navEntries: NavEntry[] = [
    {
      key: "overview",
      label: "Overview",
      icon: <LayoutDashboard className="h-4 w-4" />,
      path: base,
      always: true,
    },
    {
      key: "pmt",
      label: "Projects",
      icon: <FolderKanban className="h-4 w-4" />,
      path: `${base}/projects`,
      children: [
        { label: "All Projects", path: `${base}/projects` },
        { label: "Board", path: `${base}/projects/board` },
        { label: "Table", path: `${base}/projects/table` },
        { label: "Timeline", path: `${base}/projects/timeline` },
        { label: "Gantt", path: `${base}/projects/gantt` },
        { label: "Calendar", path: `${base}/projects/calendar` },
        { label: "Roadmap", path: `${base}/projects/roadmap` },
        { label: "Backlog", path: `${base}/projects/backlog` },
        { label: "Sprint Board", path: `${base}/projects/sprint-board` },
        { label: "Team Planner", path: `${base}/projects/team-planner` },
        { label: "Meetings", path: `${base}/projects/meetings` },
        { label: "Discussions", path: `${base}/projects/discussions` },
        { label: "News", path: `${base}/projects/news` },
        { label: "Wiki", path: `${base}/projects/wiki` },
        { label: "Settings", path: `${base}/projects/settings` },
      ],
    },
    {
      key: "knowledge",
      label: "Knowledge",
      icon: <BookOpen className="h-4 w-4" />,
      path: `${base}/knowledge`,
      children: [
        { label: "Documents", path: `${base}/knowledge` },
        { label: "Decisions", path: `${base}/knowledge/decisions` },
        { label: "Search", path: `${base}/knowledge/search` },
      ],
    },
    {
      key: "agents",
      label: "Agents",
      icon: <Bot className="h-4 w-4" />,
      path: `${base}/agents`,
      children: [
        { label: "Roster", path: `${base}/agents` },
        { label: "Runs", path: `${base}/agents/runs` },
      ],
    },
    {
      key: "collaboration",
      label: "Collaboration",
      icon: <MessageSquare className="h-4 w-4" />,
      path: `${base}/collaboration`,
    },
    {
      key: "reporting",
      label: "Reports",
      icon: <BarChart3 className="h-4 w-4" />,
      path: `${base}/reports`,
    },
    {
      key: "governance",
      label: "Governance",
      icon: <ShieldCheck className="h-4 w-4" />,
      path: `${base}/governance`,
      always: true,
    },
  ];

  const visible = navEntries.filter(
    (e) => e.always || enabledModules.has(e.key)
  );

  const isActive = (path: string) => {
    if (path === base) return location === base;
    return location.startsWith(path);
  };

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-card transition-all duration-200 shrink-0",
        collapsed ? "w-12" : "w-60"
      )}
    >
      {/* Workspace title */}
      <div className="flex items-center gap-2 border-b px-3 h-12">
        {!collapsed && (
          <span className="text-sm font-semibold truncate flex-1">
            {workspaceName}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onToggle}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* All Workspaces link */}
      <div className="px-2 pt-2 pb-1">
        <Link href="/workspaces">
          <button
            onClick={handleNav}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
              collapsed && "justify-center px-0"
            )}
          >
            <Home className="h-4 w-4" />
            {!collapsed && <span>All Workspaces</span>}
          </button>
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {visible.map((entry) => {
          const active = isActive(entry.path);
          const item = (
            <Link key={entry.key} href={entry.path}>
              <button
                onClick={handleNav}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  collapsed && "justify-center px-0"
                )}
              >
                {entry.icon}
                {!collapsed && <span className="truncate">{entry.label}</span>}
              </button>
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={entry.key}>
                <TooltipTrigger asChild>{item}</TooltipTrigger>
                <TooltipContent side="right">{entry.label}</TooltipContent>
              </Tooltip>
            );
          }

          return (
            <div key={entry.key}>
              {item}
              {/* Sub-items when expanded and parent is active */}
              {entry.children && active && !collapsed && (
                <div className="ml-6 mt-0.5 space-y-0.5">
                  {entry.children.map((child) => (
                    <Link key={child.path} href={child.path}>
                      <button
                        onClick={handleNav}
                        className={cn(
                          "flex items-center w-full px-2 py-1 text-xs rounded-md transition-colors",
                          location === child.path
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {child.label}
                      </button>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="border-t p-2 space-y-0.5">
        <button
          onClick={onOversightOpen}
          className={cn(
            "flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            collapsed && "justify-center px-0"
          )}
        >
          <Shield className="h-4 w-4" />
          {!collapsed && <span>Oversight</span>}
        </button>
        <Link href={`${base}/settings`}>
          <button
            className={cn(
              "flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
              collapsed && "justify-center px-0"
            )}
          >
            <Settings className="h-4 w-4" />
            {!collapsed && <span>Settings</span>}
          </button>
        </Link>
      </div>
    </aside>
  );
}
