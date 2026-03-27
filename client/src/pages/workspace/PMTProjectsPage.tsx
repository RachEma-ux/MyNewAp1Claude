/**
 * PMT Projects — Project list with CRUD
 */

import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, FolderKanban, Trash2 } from "lucide-react";
import { toast } from "sonner";

const riskBadge: Record<string, string> = {
  low: "bg-green-500/10 text-green-600 border-green-500/20",
  medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  high: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  critical: "bg-red-500/10 text-red-600 border-red-500/20",
};

export function PMTProjectsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [riskLevel, setRiskLevel] = useState<string>("low");

  const utils = trpc.useUtils();
  const { data: projects, isLoading } = trpc.modules.pmt.projects.list.useQuery();

  const createMut = trpc.modules.pmt.projects.create.useMutation({
    onSuccess: () => {
      utils.modules.pmt.projects.list.invalidate();
      setCreateOpen(false);
      setName("");
      setDescription("");
      toast.success("Project created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.modules.pmt.projects.delete.useMutation({
    onSuccess: () => {
      utils.modules.pmt.projects.list.invalidate();
      toast.success("Project deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderKanban className="h-6 w-6" />
            Projects
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {projects?.length || 0} projects in workspace
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Project
        </Button>
      </div>

      {projects && projects.length > 0 ? (
        <div className="grid gap-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/w/${}/projects/${p.id}`}>
              <Card className="cursor-pointer hover:border-primary/50 transition-colors">
                <CardContent className="flex items-center gap-3 py-4 overflow-hidden">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{p.name}</span>
                      {p.riskLevel && (
                        <Badge variant="outline" className={`shrink-0 ${riskBadge[p.riskLevel] || ""}`}>
                          {p.riskLevel}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs shrink-0">
                        {p.status || "active"}
                      </Badge>
                    </div>
                    {p.description && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {p.description}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (confirm("Delete this project?")) {
                        deleteMut.mutate({ id: p.id });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <FolderKanban className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No projects yet. Create your first project to get started.</p>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Risk Level</Label>
              <Select value={riskLevel} onValueChange={setRiskLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                createMut.mutate({
                  name,
                  description: description || undefined,
                  riskLevel: riskLevel as "low" | "medium" | "high" | "critical",
                })
              }
              disabled={!name.trim() || createMut.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
