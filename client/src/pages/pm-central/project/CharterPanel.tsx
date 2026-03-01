import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, FileText, User, Calendar, Target } from "lucide-react";

export default function CharterPanel({ projectId }: { projectId: number }) {
  const query = trpc.modules.pmt.shell.projects.get.useQuery({ id: projectId });
  const project = query.data;

  if (query.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!project) return <div className="text-center py-20 text-muted-foreground">Project not found</div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Charter / Intake</h2>
        <p className="text-sm text-muted-foreground">Project charter — the founding document created in PM Shell</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {project.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {project.description && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</label>
              <p className="text-sm mt-1">{project.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</label>
              <div className="mt-1">
                <Badge variant="outline" className="capitalize">{(project.status || "draft_shell").replace(/_/g, " ")}</Badge>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Risk Level</label>
              <div className="mt-1">
                <Badge variant={project.riskLevel === "high" || project.riskLevel === "critical" ? "destructive" : "secondary"} className="capitalize">
                  {project.riskLevel || "low"}
                </Badge>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Start Date</label>
              <p className="text-sm mt-1 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                {project.startDate ? new Date(project.startDate).toLocaleDateString() : "Not set"}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Target Date</label>
              <p className="text-sm mt-1 flex items-center gap-1">
                <Target className="h-3.5 w-3.5 text-muted-foreground" />
                {project.targetDate ? new Date(project.targetDate).toLocaleDateString() : "Not set"}
              </p>
            </div>
          </div>

          {project.methodology && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Methodology</label>
              <p className="text-sm mt-1 capitalize">{project.methodology}</p>
            </div>
          )}

          {project.sponsor && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sponsor</label>
              <p className="text-sm mt-1 flex items-center gap-1">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                {project.sponsor}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Intake Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {[
              { label: "Project name defined", done: !!project.name },
              { label: "Description provided", done: !!project.description },
              { label: "Risk level assessed", done: !!project.riskLevel },
              { label: "Start date set", done: !!project.startDate },
              { label: "Target date set", done: !!project.targetDate },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${item.done ? "border-green-500 bg-green-500/20" : "border-muted-foreground"}`}>
                  {item.done && <div className="h-2 w-2 rounded-full bg-green-500" />}
                </div>
                <span className={item.done ? "" : "text-muted-foreground"}>{item.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
