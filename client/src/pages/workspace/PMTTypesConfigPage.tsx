/**
 * PMT Types Configuration — Manage work item types
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { Loader2, Tags, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface TypeForm {
  name: string;
  color: string;
  icon: string;
  isMilestone: boolean;
}

const emptyForm: TypeForm = { name: "", color: "#3b82f6", icon: "circle", isMilestone: false };

export function PMTTypesConfigPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TypeForm>(emptyForm);

  const utils = trpc.useUtils();

  const { data: types, isLoading } = trpc.modules.pmt.config.types.list.useQuery();

  const createMut = trpc.modules.pmt.config.types.create.useMutation({
    onSuccess: () => {
      utils.modules.pmt.config.types.list.invalidate();
      setDialogOpen(false);
      setForm(emptyForm);
      toast.success("Type created");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.modules.pmt.config.types.update.useMutation({
    onSuccess: () => {
      utils.modules.pmt.config.types.list.invalidate();
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success("Type updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.modules.pmt.config.types.delete.useMutation({
    onSuccess: () => {
      utils.modules.pmt.config.types.list.invalidate();
      toast.success("Type deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      color: t.color || "#3b82f6",
      icon: t.icon || "circle",
      isMilestone: t.isMilestone || false,
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
    if (confirm("Delete this type?")) {
      deleteMut.mutate({ id });
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Tags className="h-6 w-6" />
          Work Item Types
        </h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add Type
        </Button>
      </div>

      {!types || types.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No types configured. Add your first work item type.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {types.map((t: any) => (
            <Card key={t.id} className="group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: t.color || "#3b82f6" }}
                    />
                    <div>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">Icon: {t.icon || "circle"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {t.isMilestone && (
                      <Badge variant="secondary" className="text-[10px]">Milestone</Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100"
                      onClick={() => openEdit(t)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive"
                      onClick={() => handleDelete(t.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Type" : "Create Type"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Bug, Feature, Epic"
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
            <div className="space-y-2">
              <Label>Icon name</Label>
              <Input
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                placeholder="circle, bug, star, etc."
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.isMilestone}
                onCheckedChange={(v) => setForm({ ...form, isMilestone: v })}
              />
              <Label>Is Milestone</Label>
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
