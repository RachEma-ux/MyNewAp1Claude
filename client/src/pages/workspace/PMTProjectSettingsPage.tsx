/**
 * PMT Project Settings — Project-level configuration overview
 */

import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Settings, Tags, CircleDot, Workflow, ListTree, Save } from "lucide-react";
import { toast } from "sonner";

const LIFECYCLE_OPTIONS = ["initiating", "planning", "executing", "monitoring", "closing"];
const RISK_LEVELS = ["low", "medium", "high", "critical"];

export function PMTProjectSettingsPage() {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    description: "",
    lifecycle: "",
    riskLevel: "",
  });

  const utils = trpc.useUtils();

  const { data: projects } = trpc.modules.pmt.projects.list.useQuery();
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: project, isLoading } = trpc.modules.pmt.projects.get.useQuery(
    { id: projectId! },
    { enabled: !!projectId }
  );

  const updateMut = trpc.modules.pmt.projects.update.useMutation({
    onSuccess: () => {
      utils.modules.pmt.projects.get.invalidate();
      utils.modules.pmt.projects.list.invalidate();
      setEditing(false);
      toast.success("Project updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const startEdit = () => {
    if (!project) return;
    setForm({
      description: project.description || "",
      lifecycle: project.lifecycle || "planning",
      riskLevel: project.riskLevel || "medium",
    });
    setEditing(true);
  };

  const handleSave = () => {
    if (!projectId) return;
    updateMut.mutate({
      id: projectId,
      description: form.description || undefined,
      lifecycle: form.lifecycle || undefined,
      riskLevel: form.riskLevel || undefined,
    });
  };

  const basePath = `/pm/projects/config`;
  const configLinks = [
    { label: "Work Item Types", icon: Tags, description: "Configure task types, colors, and icons", path: `${basePath}/types` },
    { label: "Statuses", icon: CircleDot, description: "Manage workflow statuses and ordering", path: `${basePath}/statuses` },
    { label: "Workflow Transitions", icon: Workflow, description: "Define allowed status transitions per type", path: `${basePath}/workflows` },
    { label: "Custom Fields", icon: ListTree, description: "Add custom fields to work items", path: `${basePath}/fields` },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Project Settings
        </h1>
        {projects && projects.length > 0 && (
          <Select
            value={String(projectId || "")}
            onValueChange={(v) => {
              setSelectedProject(parseInt(v));
              setEditing(false);
            }}
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
      ) : !project ? (
        <div className="text-center py-12 text-muted-foreground">
          Project not found.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Project Details Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Project Details</CardTitle>
                {!editing ? (
                  <Button variant="outline" size="sm" onClick={startEdit}>
                    Edit
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={updateMut.isPending}>
                      {updateMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      <Save className="h-3 w-3 mr-1" />
                      Save
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <div className="font-medium">{project.name}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <div>
                    <Badge variant="outline">{project.status || "active"}</Badge>
                  </div>
                </div>
              </div>

              {editing ? (
                <>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Lifecycle Phase</Label>
                      <Select
                        value={form.lifecycle}
                        onValueChange={(v) => setForm({ ...form, lifecycle: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LIFECYCLE_OPTIONS.map((l) => (
                            <SelectItem key={l} value={l}>
                              {l.charAt(0).toUpperCase() + l.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Risk Level</Label>
                      <Select
                        value={form.riskLevel}
                        onValueChange={(v) => setForm({ ...form, riskLevel: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RISK_LEVELS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r.charAt(0).toUpperCase() + r.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label className="text-xs text-muted-foreground">Description</Label>
                    <div className="text-sm">{project.description || "No description"}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Lifecycle Phase</Label>
                      <div>
                        <Badge variant="secondary">
                          {(project.lifecycle || "planning").charAt(0).toUpperCase() +
                            (project.lifecycle || "planning").slice(1)}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Risk Level</Label>
                      <div>
                        <Badge
                          variant={
                            project.riskLevel === "critical" || project.riskLevel === "high"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {(project.riskLevel || "medium").charAt(0).toUpperCase() +
                            (project.riskLevel || "medium").slice(1)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Config Links */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Configuration</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {configLinks.map((link) => (
                <Link key={link.label} href={link.path}>
                  <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <CardContent className="p-4 flex items-center gap-3">
                      <link.icon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium text-sm">{link.label}</div>
                        <div className="text-xs text-muted-foreground">{link.description}</div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
