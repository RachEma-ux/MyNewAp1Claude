/**
 * PMT Status Configuration — Manage workflow statuses with ordering
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, CircleDot, Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";

interface StatusForm {
  name: string;
  color: string;
  isClosed: boolean;
  position: number;
}

const emptyForm: StatusForm = { name: "", color: "#3b82f6", isClosed: false, position: 0 };

export function PMTStatusConfigPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<StatusForm>(emptyForm);

  const utils = trpc.useUtils();

  const { data: statuses, isLoading } = trpc.modules.pmt.config.statuses.list.useQuery();

  const sortedStatuses = statuses ? [...statuses].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)) : [];

  const createMut = trpc.modules.pmt.config.statuses.create.useMutation({
    onSuccess: () => {
      utils.modules.pmt.config.statuses.list.invalidate();
      setDialogOpen(false);
      setForm(emptyForm);
      toast.success("Status created");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.modules.pmt.config.statuses.update.useMutation({
    onSuccess: () => {
      utils.modules.pmt.config.statuses.list.invalidate();
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success("Status updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.modules.pmt.config.statuses.delete.useMutation({
    onSuccess: () => {
      utils.modules.pmt.config.statuses.list.invalidate();
      toast.success("Status deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditingId(null);
    const nextPos = sortedStatuses.length > 0
      ? Math.max(...sortedStatuses.map((s: any) => s.position ?? 0)) + 1
      : 0;
    setForm({ ...emptyForm, position: nextPos });
    setDialogOpen(true);
  };

  const openEdit = (s: any) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      color: s.color || "#3b82f6",
      isClosed: s.isClosed || false,
      position: s.position ?? 0,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (editingId) {
      updateMut.mutate({ id: editingId, ...form });
    } else {
      createMut.mutate({ ...form });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Delete this status?")) {
      deleteMut.mutate({ id });
    }
  };

  const moveUp = (s: any, idx: number) => {
    if (idx === 0) return;
    const prev = sortedStatuses[idx - 1];
    updateMut.mutate({ id: s.id, position: prev.position ?? idx - 1 });
    updateMut.mutate({ id: prev.id, position: s.position ?? idx });
  };

  const moveDown = (s: any, idx: number) => {
    if (idx >= sortedStatuses.length - 1) return;
    const next = sortedStatuses[idx + 1];
    updateMut.mutate({ id: s.id, position: next.position ?? idx + 1 });
    updateMut.mutate({ id: next.id, position: s.position ?? idx });
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CircleDot className="h-6 w-6" />
          Statuses
        </h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add Status
        </Button>
      </div>

      {sortedStatuses.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No statuses configured. Add your first status.
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Closed</TableHead>
                <TableHead>Position</TableHead>
                <TableHead className="w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedStatuses.map((s: any, idx: number) => (
                <TableRow key={s.id}>
                  <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell>
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: s.color || "#3b82f6" }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>
                    {s.isClosed && <Badge variant="default" className="text-[10px]">Closed</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">{s.position ?? 0}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => moveUp(s, idx)}
                        disabled={idx === 0}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => moveDown(s, idx)}
                        disabled={idx >= sortedStatuses.length - 1}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(s)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDelete(s.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Status" : "Create Status"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. To Do, In Progress, Done"
              />
            </div>
            <div className="space-y-2">
              <Label>Color (hex)</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  placeholder="#3b82f6"
                  className="flex-1"
                />
                <div
                  className="w-8 h-8 rounded border"
                  style={{ backgroundColor: form.color }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.isClosed}
                onCheckedChange={(v) => setForm({ ...form, isClosed: v })}
              />
              <Label>Is Closed Status</Label>
            </div>
            <div className="space-y-2">
              <Label>Position</Label>
              <Input
                type="number"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMut.isPending || updateMut.isPending}
            >
              {(createMut.isPending || updateMut.isPending) && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              {editingId ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
