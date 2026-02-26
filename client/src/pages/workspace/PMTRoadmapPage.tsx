/**
 * PMT Roadmap View — Version cards with task progress
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Milestone, Calendar } from "lucide-react";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  open: "outline",
  locked: "secondary",
  closed: "default",
};

const CLOSED_STATUSES = ["done", "closed", "resolved"];

export function PMTRoadmapPage({ workspaceId }: { workspaceId: number }) {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);

  const { data: projects } = trpc.modules.pmt.projects.list.useQuery({ workspaceId });
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: versions, isLoading: versionsLoading } = trpc.modules.pmt.versions.list.useQuery(
    { workspaceId, projectId: projectId! },
    { enabled: !!projectId }
  );

  const { data: tasks, isLoading: tasksLoading } = trpc.modules.pmt.tasks.list.useQuery(
    { workspaceId, projectId: projectId! },
    { enabled: !!projectId }
  );

  const isLoading = versionsLoading || tasksLoading;

  // Calculate progress per version — currently tasks don't have versionId,
  // so we show versions as cards and all tasks below.
  // When versionId is added, tasks will be grouped under their version.
  const closedCount = tasks ? tasks.filter((t: any) => CLOSED_STATUSES.includes(t.status)).length : 0;
  const totalCount = tasks?.length || 0;
  const overallProgress = totalCount > 0 ? Math.round((closedCount / totalCount) * 100) : 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Milestone className="h-6 w-6" />
          Roadmap
        </h1>
        {projects && projects.length > 0 && (
          <Select
            value={String(projectId || "")}
            onValueChange={(v) => setSelectedProject(parseInt(v))}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p: any) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!projectId ? (
        <div className="text-center py-12 text-muted-foreground">
          No projects available. Create a project first.
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Version cards */}
          {versions && versions.length > 0 ? (
            <div className="space-y-4">
              {versions.map((v: any) => (
                <Card key={v.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Milestone className="h-4 w-4" />
                        {v.name}
                      </CardTitle>
                      <Badge variant={statusVariant[v.status] || "outline"}>
                        {v.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {v.description && (
                      <p className="text-sm text-muted-foreground">{v.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {v.startDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Start: {new Date(v.startDate).toLocaleDateString()}
                        </span>
                      )}
                      {v.dueDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Due: {new Date(v.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {/* Placeholder progress — will use version-specific tasks later */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span>—</span>
                      </div>
                      <Progress value={0} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground border rounded-md">
              No versions defined yet. Create versions to build your roadmap.
            </div>
          )}

          {/* All tasks — unversioned for now */}
          {tasks && tasks.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                All Work Items
                <Badge variant="secondary">{totalCount}</Badge>
              </h2>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Overall progress</span>
                  <span>{closedCount}/{totalCount} closed ({overallProgress}%)</span>
                </div>
                <Progress value={overallProgress} className="h-2" />
              </div>
              <div className="border rounded-md divide-y max-h-[400px] overflow-y-auto">
                {tasks.map((t: any) => (
                  <div key={t.id} className="px-3 py-2 flex items-center gap-3 text-sm">
                    <Badge variant="outline" className="text-[10px]">
                      {t.type || "task"}
                    </Badge>
                    <span className="flex-1 truncate">{t.title}</span>
                    <Badge variant={CLOSED_STATUSES.includes(t.status) ? "default" : "secondary"} className="text-[10px]">
                      {t.status}
                    </Badge>
                    {t.dueDate && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(t.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
