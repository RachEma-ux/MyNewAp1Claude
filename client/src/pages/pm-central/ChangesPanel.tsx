import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { GitBranch, Plus, ShieldCheck, Clock, Loader2 } from "lucide-react";

const CHANGE_TYPES = [
  { value: "scope", label: "Scope" },
  { value: "schedule", label: "Schedule" },
  { value: "budget", label: "Budget" },
  { value: "resource", label: "Resource" },
  { value: "technical", label: "Technical" },
];

const IMPACT_LEVELS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500",
  submitted: "bg-blue-500",
  under_review: "bg-yellow-500",
  approved: "bg-green-500",
  rejected: "bg-red-500",
  implemented: "bg-emerald-500",
};

export default function ChangesPanel() {
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const projectsQuery = trpc.modules.pmt.shell.projects.list.useQuery();
  const executingProjects = (projectsQuery.data ?? []).filter((p: any) =>
    ["executing", "change_pending"].includes(p.status)
  );

  // In a full implementation, this would query pmt_change_requests via tRPC
  // For now, show the UI structure with projects that could have changes
  const changeRequests: any[] = [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Change Control</h1>
          <p className="text-muted-foreground mt-1">
            Manage change requests — scope, schedule, budget, and technical changes with G2 gate review
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              New Change Request
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Change Request</DialogTitle>
              <DialogDescription>
                Submit a change request for an executing project. High-impact changes will require G2 gate review.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">Project</label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {executingProjects.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Title</label>
                <Input placeholder="Change request title" />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea placeholder="Describe the change and its justification..." rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Change Type</label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANGE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Impact</label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Impact" />
                    </SelectTrigger>
                    <SelectContent>
                      {IMPACT_LEVELS.map((i) => (
                        <SelectItem key={i.value} value={i.value}>
                          {i.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setDialogOpen(false)}>
                Create Draft
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status summary */}
      <div className="grid gap-4 md:grid-cols-4">
        {["draft", "submitted", "under_review", "approved"].map((status) => (
          <Card key={status}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium capitalize">
                {status.replace("_", " ")}
              </CardTitle>
              <div className={`h-2 w-2 rounded-full ${STATUS_COLORS[status]}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {changeRequests.filter((c: any) => c.status === status).length}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {projectsQuery.isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      )}

      {changeRequests.length === 0 && !projectsQuery.isLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <GitBranch className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No Change Requests</h3>
            <p className="text-muted-foreground mt-1">
              Change requests for executing projects will appear here. Each change goes through
              the G2 gate for impact assessment and approval.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Change request workflow visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            G2 Change Control Workflow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            {["Draft", "Submitted", "Under Review (G2)", "Approved", "Implemented"].map(
              (step, i, arr) => (
                <div key={step} className="flex items-center gap-2">
                  <Badge variant="outline" className="whitespace-nowrap">
                    {step}
                  </Badge>
                  {i < arr.length - 1 && (
                    <span className="text-muted-foreground">→</span>
                  )}
                </div>
              )
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            High and critical impact changes automatically trigger G2 gate evaluation.
            Low impact changes may be fast-tracked with PM owner approval.
          </p>
        </CardContent>
      </Card>

      {/* Projects with pending changes */}
      {executingProjects
        .filter((p: any) => p.status === "change_pending")
        .map((project: any) => (
          <Card key={project.id} className="border-orange-500/50 cursor-pointer hover:border-orange-500 transition-colors" onClick={() => setLocation(`/pm-central/project/${project.id}/changes`)}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  {project.name}
                </CardTitle>
                <p className="text-sm text-orange-400 mt-1">
                  Change request pending G2 gate review
                </p>
              </div>
              <Badge className="bg-orange-500">Change Pending</Badge>
            </CardHeader>
          </Card>
        ))}
    </div>
  );
}
