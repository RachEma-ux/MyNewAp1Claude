/**
 * PMT Project Templates — Create and apply reusable project blueprints
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, FileStack, Plus, Copy, Pencil, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export function PMTProjectTemplatesPage({ workspaceId }: { workspaceId: number }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", description: "", templateData: "{}" });
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [applyTemplateId, setApplyTemplateId] = useState<number | null>(null);
  const [applyProjectName, setApplyProjectName] = useState("");

  const utils = trpc.useUtils();
  const { data: templates, isLoading } = trpc.modules.pmt.templates.projectTemplates.list.useQuery({ workspaceId });

  const createMut = trpc.modules.pmt.templates.projectTemplates.create.useMutation({
    onSuccess: () => { utils.modules.pmt.templates.projectTemplates.list.invalidate(); setDialogOpen(false); toast.success("Template created"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.modules.pmt.templates.projectTemplates.update.useMutation({
    onSuccess: () => { utils.modules.pmt.templates.projectTemplates.list.invalidate(); setDialogOpen(false); toast.success("Template updated"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.modules.pmt.templates.projectTemplates.delete.useMutation({
    onSuccess: () => { utils.modules.pmt.templates.projectTemplates.list.invalidate(); toast.success("Template deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const applyMut = trpc.modules.pmt.templates.projectTemplates.useTemplate.useMutation({
    onSuccess: () => {
      utils.modules.pmt.projects.list.invalidate();
      setApplyDialogOpen(false);
      setApplyProjectName("");
      toast.success("Project created from template (with statuses, types & tasks)");
    },
    onError: (e) => toast.error(e.message),
  });

  const seedMut = trpc.modules.pmt.templates.projectTemplates.seed.useMutation({
    onSuccess: () => {
      utils.modules.pmt.templates.projectTemplates.list.invalidate();
      toast.success("Full PM Lifecycle template created");
    },
    onError: (e) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", description: "", templateData: "{}" });
    setDialogOpen(true);
  };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      description: t.description || "",
      templateData: JSON.stringify(t.templateData, null, 2),
    });
    setDialogOpen(true);
  };

  const openApply = (templateId: number, templateName: string) => {
    setApplyTemplateId(templateId);
    setApplyProjectName(templateName);
    setApplyDialogOpen(true);
  };

  const handleApply = () => {
    if (!applyTemplateId || !applyProjectName.trim()) return;
    applyMut.mutate({ id: applyTemplateId, workspaceId, name: applyProjectName.trim() });
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    let parsed: any;
    try { parsed = JSON.parse(form.templateData); } catch { toast.error("Invalid JSON"); return; }
    const payload = {
      workspaceId,
      name: form.name,
      description: form.description || undefined,
      templateData: parsed,
    };
    if (editingId) {
      updateMut.mutate({ id: editingId, ...payload });
    } else {
      createMut.mutate(payload);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileStack className="h-6 w-6" />
          Project Templates
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => seedMut.mutate({ workspaceId })} disabled={seedMut.isPending}>
            <Sparkles className="h-4 w-4 mr-1" />
            {seedMut.isPending ? "Seeding..." : "Seed Default Template"}
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            New Template
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !templates || (templates as any[]).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No project templates. Click "Seed Default Template" to create a built-in PM lifecycle template, or create your own.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(templates as any[]).map((t: any) => {
            const tplData = t.templateData as Record<string, unknown> | null;
            const statusCount = Array.isArray(tplData?.statuses) ? (tplData.statuses as any[]).length : 0;
            const typeCount = Array.isArray(tplData?.types) ? (tplData.types as any[]).length : 0;
            const phaseCount = Array.isArray(tplData?.phases) ? (tplData.phases as any[]).length : 0;
            return (
              <Card key={t.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="truncate">{t.name}</span>
                    <Badge variant="outline" className="text-[10px]">Template</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {t.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>
                  )}
                  {(statusCount > 0 || typeCount > 0 || phaseCount > 0) && (
                    <div className="flex flex-wrap gap-1">
                      {statusCount > 0 && <Badge variant="secondary" className="text-[10px]">{statusCount} statuses</Badge>}
                      {typeCount > 0 && <Badge variant="secondary" className="text-[10px]">{typeCount} types</Badge>}
                      {phaseCount > 0 && <Badge variant="secondary" className="text-[10px]">{phaseCount} phases</Badge>}
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => openApply(t.id, t.name)} disabled={applyMut.isPending}>
                      <Copy className="h-3 w-3 mr-1" />
                      Apply
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { if (confirm("Delete?")) deleteMut.mutate({ id: t.id, workspaceId }); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Template Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Template" : "Create Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Template name" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Template Data (JSON)</Label>
              <Textarea
                value={form.templateData}
                onChange={(e) => setForm({ ...form, templateData: e.target.value })}
                rows={8}
                className="font-mono text-xs"
                placeholder='{"statuses": [...], "types": [...], "phases": [...]}'
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>
              {editingId ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Template Dialog (project name prompt) */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Project from Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Project Name</Label>
              <Input
                value={applyProjectName}
                onChange={(e) => setApplyProjectName(e.target.value)}
                placeholder="My New Project"
                onKeyDown={(e) => { if (e.key === "Enter") handleApply(); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleApply} disabled={applyMut.isPending || !applyProjectName.trim()}>
              {applyMut.isPending ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
