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
import { Loader2, FileStack, Plus, Copy, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function PMTProjectTemplatesPage({ workspaceId }: { workspaceId: number }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", description: "", templateData: "{}" });

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
    onSuccess: () => { utils.modules.pmt.projects.list.invalidate(); toast.success("Project created from template"); },
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
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !templates || (templates as any[]).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No project templates. Create your first template.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(templates as any[]).map((t: any) => (
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
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => applyMut.mutate({ id: t.id, workspaceId })} disabled={applyMut.isPending}>
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
          ))}
        </div>
      )}

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
                placeholder='{"defaultStatuses": ["backlog","todo","in_progress","done"]}'
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
    </div>
  );
}
