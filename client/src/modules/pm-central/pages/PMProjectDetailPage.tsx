/**
 * /pm-central/rtlm/projects/:id — single project detail.
 */

import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PMTaskBoard } from "../components/PMTaskBoard";
import { PMMilestoneList } from "../components/PMMilestoneList";
import { PMRiskList } from "../components/PMRiskList";
import { PMIssueList } from "../components/PMIssueList";

export default function PMProjectDetailPage() {
  const [, params] = useRoute<{ id: string }>("/pm-central/rtlm/projects/:id");
  const id = params ? Number(params.id) : NaN;
  const { data: project, isLoading, error } = trpc.pmCentral.projects.get.useQuery(
    { id },
    { enabled: Number.isFinite(id) },
  );
  if (!Number.isFinite(id))
    return <div className="p-6 text-sm text-destructive">Invalid project id.</div>;
  if (isLoading)
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (error)
    return (
      <div className="p-6 text-sm text-destructive">{error.message}</div>
    );
  if (!project)
    return <div className="p-6 text-sm text-muted-foreground">Not found.</div>;

  return (
    <div className="p-6 flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{project.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm">
          <Badge variant="secondary">{project.priority}</Badge>
          <Badge>{project.status}</Badge>
          {project.sourceModule && (
            <Badge variant="outline">
              from {project.sourceModule}#{project.sourceRefId ?? "?"}
            </Badge>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Milestones</CardTitle>
          </CardHeader>
          <CardContent>
            <PMMilestoneList pmProjectId={project.id} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Risks</CardTitle>
          </CardHeader>
          <CardContent>
            <PMRiskList pmProjectId={project.id} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <PMIssueList pmProjectId={project.id} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <PMTaskBoard pmProjectId={project.id} />
        </CardContent>
      </Card>
    </div>
  );
}
