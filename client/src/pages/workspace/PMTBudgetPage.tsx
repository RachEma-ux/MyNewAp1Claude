/**
 * PMT Budget Page — Budget list with planned vs actual variance
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Wallet, Plus } from "lucide-react";
import { toast } from "sonner";

export function PMTBudgetPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", description: "", plannedLabor: 0, plannedUnits: 0, projectId: "" });

  const utils = trpc.useUtils();
  const { data: projects } = trpc.modules.pmt.projects.list.useQuery();
  const { data: budgets, isLoading } = trpc.modules.pmt.budgets.list.useQuery();

  const createMut = trpc.modules.pmt.budgets.create.useMutation({
    onSuccess: () => { utils.modules.pmt.budgets.list.invalidate(); setDialogOpen(false); toast.success("Budget created"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.modules.pmt.budgets.update.useMutation({
    onSuccess: () => { utils.modules.pmt.budgets.list.invalidate(); setDialogOpen(false); toast.success("Budget updated"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.modules.pmt.budgets.delete.useMutation({
    onSuccess: () => { utils.modules.pmt.budgets.list.invalidate(); toast.success("Budget deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", description: "", plannedLabor: 0, plannedUnits: 0, projectId: String(projects?.[0]?.id || "") });
    setDialogOpen(true);
  };

  const openEdit = (b: any) => {
    setEditingId(b.id);
    setForm({
      name: b.name,
      description: b.description || "",
      plannedLabor: b.plannedLabor || 0,
      plannedUnits: b.plannedUnits || 0,
      projectId: String(b.projectId),
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.projectId) return;
    const payload = {
      projectId: parseInt(form.projectId),
      name: form.name,
      description: form.description || undefined,
      plannedLabor: form.plannedLabor,
      plannedUnits: form.plannedUnits,
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
          <Wallet className="h-6 w-6" />
          Budgets
        </h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          New Budget
        </Button>
      </div>

      {!budgets || (budgets as any[]).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No budgets defined. Create your first budget.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(budgets as any[]).map((b: any) => (
            <Card key={b.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{b.name}</CardTitle>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(b)}>Edit</Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { if (confirm("Delete?")) deleteMut.mutate({ id: b.id }); }}>Delete</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {b.description && <p className="text-sm text-muted-foreground">{b.description}</p>}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Planned Labor:</span>
                    <div className="font-medium">${(b.plannedLabor || 0).toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Planned Units:</span>
                    <div className="font-medium">${(b.plannedUnits || 0).toFixed(2)}</div>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">Project #{b.projectId}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Budget" : "Create Budget"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Budget name" />
            </div>
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects?.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Planned Labor ($)</Label>
                <Input type="number" value={form.plannedLabor} onChange={(e) => setForm({ ...form, plannedLabor: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Planned Units ($)</Label>
                <Input type="number" value={form.plannedUnits} onChange={(e) => setForm({ ...form, plannedUnits: parseFloat(e.target.value) || 0 })} />
              </div>
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
