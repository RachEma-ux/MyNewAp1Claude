/**
 * ProjectSwitcher — search/select projects + "Create Project" action
 */

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Search, Plus, FolderKanban, Loader2 } from "lucide-react";

const STATE_LABELS: Record<string, string> = {
  draft_shell: "Draft",
  intake_review: "Intake",
  planning: "Planning",
  plan_gate_pending: "G1 Pending",
  authorized: "Authorized",
  executing: "Executing",
  control_hold: "Hold",
  change_pending: "Change",
  closing: "Closing",
  close_gate_pending: "G4 Pending",
  closed: "Closed",
  rejected: "Rejected",
  archived: "Archived",
};

interface ProjectSwitcherProps {
  currentProjectId?: number;
  currentProjectName?: string;
}

export default function ProjectSwitcher({ currentProjectId, currentProjectName }: ProjectSwitcherProps) {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const projectsQuery = trpc.modules.pmt.shell.projects.list.useQuery(undefined, {
    enabled: open,
  });
  const allProjects = projectsQuery.data ?? [];

  const filtered = useMemo(() => {
    if (!search) return allProjects;
    const q = search.toLowerCase();
    return allProjects.filter((p: any) => p.name?.toLowerCase().includes(q));
  }, [allProjects, search]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between gap-1 text-xs h-8 px-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <FolderKanban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{currentProjectName || "Select Project"}</span>
          </div>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <div className="p-1">
          <div className="flex items-center gap-1 px-1 pb-1">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-7 text-xs border-0 bg-transparent focus-visible:ring-0 px-1"
            />
          </div>
        </div>
        <DropdownMenuSeparator />
        {projectsQuery.isLoading ? (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">
            {search ? "No matching projects" : "No projects yet"}
          </div>
        ) : (
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((p: any) => (
              <DropdownMenuItem
                key={p.id}
                className={`text-xs cursor-pointer ${p.id === currentProjectId ? "bg-primary/10" : ""}`}
                onClick={() => {
                  setLocation(`/pm-central/p/${p.id}/overview`);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="truncate">{p.name}</span>
                  <Badge variant="outline" className="text-[9px] ml-1 shrink-0">
                    {STATE_LABELS[p.status] || p.status}
                  </Badge>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-xs cursor-pointer text-primary"
          onClick={() => {
            setLocation("/pm-central/shell/new");
            setOpen(false);
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Create Project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
