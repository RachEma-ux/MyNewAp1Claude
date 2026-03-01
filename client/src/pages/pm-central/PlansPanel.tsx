import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { ClipboardList, ShieldCheck, ArrowRight, FileText, Loader2 } from "lucide-react";

const PLANNING_STATES = ["planning", "plan_gate_pending"];

export default function PlansPanel() {
  const [, setLocation] = useLocation();
  const projectsQuery = trpc.modules.pmt.shell.projects.list.useQuery();
  const projects = (projectsQuery.data ?? []).filter((p: any) =>
    PLANNING_STATES.includes(p.status)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Plans</h1>
        <p className="text-muted-foreground mt-1">
          Projects in planning phase — develop charters, task breakdowns, and submit for G1 authorization
        </p>
      </div>

      {projectsQuery.isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading projects...
        </div>
      )}

      {!projectsQuery.isLoading && projects.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No Projects in Planning</h3>
            <p className="text-muted-foreground mt-1">
              Projects that pass the G0 intake gate will appear here for planning.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {projects.map((project: any) => (
          <Card key={project.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setLocation(`/pm-central/p/${project.id}/overview`)}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-lg">{project.name}</CardTitle>
                {project.description && (
                  <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
                )}
              </div>
              <Badge variant={project.status === "plan_gate_pending" ? "default" : "secondary"}>
                {project.status === "plan_gate_pending" ? "G1 Pending" : "Planning"}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex-1 grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Risk Level</span>
                    <p className="font-medium capitalize">{project.riskLevel || "low"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Target Date</span>
                    <p className="font-medium">
                      {project.targetDate
                        ? new Date(project.targetDate).toLocaleDateString()
                        : "Not set"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Gate Status</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                      <span className="font-medium text-green-600">G0 Passed</span>
                    </div>
                  </div>
                </div>
                {project.status === "planning" && (
                  <Button size="sm" className="shrink-0" onClick={(e) => { e.stopPropagation(); setLocation(`/pm-central/p/${project.id}/gates`); }}>
                    <ArrowRight className="h-4 w-4 mr-1" />
                    Submit for G1
                  </Button>
                )}
                {project.status === "plan_gate_pending" && (
                  <Button size="sm" variant="outline" className="shrink-0" onClick={(e) => { e.stopPropagation(); setLocation(`/pm-central/p/${project.id}/gates`); }}>
                    <ShieldCheck className="h-4 w-4 mr-1" />
                    View Gate
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Planning artifacts section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Planning Artifacts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Project charters, work breakdown structures, schedules, and risk registers are managed as versioned artifacts
            with SHA-256 integrity hashes. Each artifact is linked to its project and tracked through the governance pipeline.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
