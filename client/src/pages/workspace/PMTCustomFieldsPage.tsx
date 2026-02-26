/**
 * PMT Custom Fields Configuration — Define custom fields for work items
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Loader2, ListTree, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const FIELD_TYPES = ["text", "number", "date", "list", "user", "bool"] as const;

interface FieldForm {
  name: string;
  fieldType: string;
  options: string;
  required: boolean;
  position: number;
  helpText: string;
}

const emptyForm: FieldForm = {
  name: "",
  fieldType: "text",
  options: "",
  required: false,
  position: 0,
  helpText: "",
};

export function PMTCustomFieldsPage({ workspaceId }: { workspaceId: number }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FieldForm>(emptyForm);

  const utils = trpc.useUtils();

  const { data: fields, isLoading } = trpc.modules.pmt.customFields.fields.list.useQuery({ workspaceId });

  const sortedFields = fields ? [...fields].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)) : [];

  const createMut = trpc.modules.pmt.customFields.fields.create.useMutation({
    onSuccess: () => {
      utils.modules.pmt.customFields.fields.list.invalidate();
      setDialogOpen(false);
      setForm(emptyForm);
      toast.success("Field created");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.modules.pmt.customFields.fields.update.useMutation({
    onSuccess: () => {
      utils.modules.pmt.customFields.fields.list.invalidate();
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success("Field updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.modules.pmt.customFields.fields.delete.useMutation({
    onSuccess: () => {
      utils.modules.pmt.customFields.fields.list.invalidate();
      toast.success("Field deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditingId(null);
    const nextPos = sortedFields.length > 0
      ? Math.max(...sortedFields.map((f: any) => f.position ?? 0)) + 1
      : 0;
    setForm({ ...emptyForm, position: nextPos });
    setDialogOpen(true);
  };

  const openEdit = (f: any) => {
    setEditingId(f.id);
    setForm({
      name: f.name,
      fieldType: f.fieldType || "text",
      options: Array.isArray(f.options) ? f.options.join(", ") : f.options || "",
      required: f.required || false,
      position: f.position ?? 0,
      helpText: f.helpText || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const payload: any = {
      workspaceId,
      name: form.name,
      fieldType: form.fieldType,
      required: form.required,
      position: form.position,
      helpText: form.helpText || undefined,
    };
    if (form.fieldType === "list" && form.options.trim()) {
      payload.options = form.options.split(",").map((o: string) => o.trim()).filter(Boolean);
    }
    if (editingId) {
      updateMut.mutate({ id: editingId, ...payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Delete this field?")) {
      deleteMut.mutate({ id, workspaceId });
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ListTree className="h-6 w-6" />
          Custom Fields
        </h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add Field
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sortedFields.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No custom fields defined. Add your first custom field.
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Help Text</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedFields.map((f: any) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{f.fieldType || "text"}</Badge>
                  </TableCell>
                  <TableCell>
                    {f.required && <Badge variant="default" className="text-[10px]">Required</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">{f.position ?? 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {f.helpText || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(f)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDelete(f.id)}
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
            <DialogTitle>{editingId ? "Edit Field" : "Create Field"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Story Points, Sprint, Priority Level"
              />
            </div>
            <div className="space-y-2">
              <Label>Field Type</Label>
              <Select
                value={form.fieldType}
                onValueChange={(v) => setForm({ ...form, fieldType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.fieldType === "list" && (
              <div className="space-y-2">
                <Label>Options (comma-separated)</Label>
                <Input
                  value={form.options}
                  onChange={(e) => setForm({ ...form, options: e.target.value })}
                  placeholder="Option 1, Option 2, Option 3"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch
                checked={form.required}
                onCheckedChange={(v) => setForm({ ...form, required: v })}
              />
              <Label>Required</Label>
            </div>
            <div className="space-y-2">
              <Label>Position</Label>
              <Input
                type="number"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Help Text</Label>
              <Textarea
                value={form.helpText}
                onChange={(e) => setForm({ ...form, helpText: e.target.value })}
                placeholder="Optional description for this field"
                rows={2}
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
