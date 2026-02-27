/**
 * PMT Custom Actions — Configurable multi-field update buttons
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
import { Loader2, Zap, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function PMTCustomActionsPage({ workspaceId }: { workspaceId: number }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    conditions: "{}",
    changes: "{}",
    position: 0,
  });

  const utils = trpc.useUtils();
  const { data: actions, isLoading } = trpc.modules.pmt.customActions.list.useQuery({ workspaceId });

  const createMut = trpc.modules.pmt.customActions.create.useMutation({
    onSuccess: () => { utils.modules.pmt.customActions.list.invalidate(); setDialogOpen(false); toast.success("Action created"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.modules.pmt.customActions.update.useMutation({
    onSuccess: () => { utils.modules.pmt.customActions.list.invalidate(); setDialogOpen(false); toast.success("Action updated"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.modules.pmt.customActions.delete.useMutation({
    onSuccess: () => { utils.modules.pmt.customActions.list.invalidate(); toast.success("Action deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", description: "", conditions: "{}", changes: "{}", position: 0 });
    setDialogOpen(true);
  };

  const openEdit = (a: any) => {
    setEditingId(a.id);
    setForm({
      name: a.name,
      description: a.description || "",
      conditions: JSON.stringify(a.conditions, null, 2),
      changes: JSON.stringify(a.changes, null, 2),
      position: a.position || 0,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    let conditions: any, changes: any;
    try { conditions = JSON.parse(form.conditions); } catch { toast.error("Invalid conditions JSON"); return; }
    try { changes = JSON.parse(form.changes); } catch { toast.error("Invalid changes JSON"); return; }
    const payload = {
      workspaceId,
      name: form.name,
      description: form.description || undefined,
      conditions,
      changes,
      position: form.position,
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
          <Zap className="h-6 w-6" />
          Custom Actions
        </h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          New Action
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !actions || (actions as any[]).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No custom actions defined. Create your first action.
        </div>
      ) : (
        <div className="space-y-3">
          {(actions as any[]).map((a: any) => (
            <Card key={a.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    <span className="font-medium text-sm">{a.name}</span>
                    <Badge variant="outline" className="text-[10px]">#{a.position}</Badge>
                  </div>
                  {a.description && (
                    <div className="text-xs text-muted-foreground">{a.description}</div>
                  )}
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span>Conditions: {Object.keys(a.conditions || {}).length} rules</span>
                    <span>Changes: {Object.keys(a.changes || {}).length} fields</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { if (confirm("Delete?")) deleteMut.mutate({ id: a.id, workspaceId }); }}>
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
            <DialogTitle>{editingId ? "Edit Action" : "Create Action"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Mark as Urgent" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
            </div>
            <div className="space-y-2">
              <Label>Position</Label>
              <Input type="number" value={form.position} onChange={(e) => setForm({ ...form, position: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-2">
              <Label>Conditions (JSON)</Label>
              <Textarea
                value={form.conditions}
                onChange={(e) => setForm({ ...form, conditions: e.target.value })}
                rows={4}
                className="font-mono text-xs"
                placeholder='{"status": ["todo", "in_progress"]}'
              />
            </div>
            <div className="space-y-2">
              <Label>Changes (JSON)</Label>
              <Textarea
                value={form.changes}
                onChange={(e) => setForm({ ...form, changes: e.target.value })}
                rows={4}
                className="font-mono text-xs"
                placeholder='{"priority": "critical", "status": "in_progress"}'
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
