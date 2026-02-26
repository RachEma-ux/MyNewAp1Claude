/**
 * PMT Portfolio — Cross-project overview with status and progress
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Briefcase } from "lucide-react";

const riskColors: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export function PMTPortfolioPage({ workspaceId }: { workspaceId: number }) {
  const { data: projects, isLoading } = trpc.modules.pmt.projects.list.useQuery({ workspaceId });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Briefcase className="h-6 w-6" />
          Portfolio
        </h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !projects || projects.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No projects found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p: any) => (
            <ProjectCard key={p.id} project={p} workspaceId={workspaceId} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project, workspaceId }: { project: any; workspaceId: number }) {
  const { data: tasks } = trpc.modules.pmt.tasks.list.useQuery(
    { workspaceId, projectId: project.id },
    { retry: false }
  );

  const total = tasks?.length || 0;
  const done = tasks ? (tasks as any[]).filter(t => t.status === "done").length : 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Card className="hover:border-primary/30 transition-colors">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="truncate">{project.name}</span>
          <Badge variant="outline" className="text-[10px]">
            {project.status || "active"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{total} tasks</span>
          <span className="font-medium">{pct}% complete</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center gap-2">
          {project.lifecycle && (
            <Badge variant="secondary" className="text-[10px]">
              {project.lifecycle}
            </Badge>
          )}
          {project.riskLevel && (
            <Badge className={`text-[10px] ${riskColors[project.riskLevel] || ""}`}>
              {project.riskLevel} risk
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
