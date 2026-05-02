/**
 * PSDimensionValueEditor — Dimension values sub-panel
 *
 * Inline CRUD for values within a dimension. Used inside PSDimensionEditor.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";

export function PSDimensionValueEditor({
  dimensionId,
  isDraft,
}: {
  dimensionId: number;
  isDraft: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: values, isLoading } = trpc.ps.matrix.listAllDimensionValues.useQuery(
    { dimensionId },
  );

  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [editId, setEditId] = useState<number | null>(null);
  const [editKey, setEditKey] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const invalidate = () => { utils.ps.matrix.listAllDimensionValues.invalidate(); };

  const createMut = trpc.ps.matrix.createDimensionValue.useMutation({
    onSuccess: () => { invalidate(); setShowCreate(false); setNewKey(""); setNewLabel(""); setNewDesc(""); toast.success("Value created"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.ps.matrix.updateDimensionValue.useMutation({
    onSuccess: () => { invalidate(); setEditId(null); toast.success("Value updated"); },
    onError: (e) => toast.error(e.message),
  });

  const toggleMut = trpc.ps.matrix.updateDimensionValue.useMutation({
    onSuccess: () => { invalidate(); toast.success("Value toggled"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.ps.matrix.deleteDimensionValue.useMutation({
    onSuccess: () => { invalidate(); toast.success("Value deleted"); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <Loader2 className="w-4 h-4 animate-spin mx-auto" />;

  return (
    <div className="pl-6 pt-2 border-t space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Values ({values?.length ?? 0})</span>
        <Button size="sm" variant="outline" onClick={() => setShowCreate(true)} disabled={!isDraft} className="h-6 text-xs"><Plus className="w-3 h-3 mr-0.5" />Add Value</Button>
      </div>

      {values && values.length > 0 && (
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-xs">Key</TableHead>
            <TableHead className="text-xs">Label</TableHead>
            <TableHead className="text-xs">Active</TableHead>
            <TableHead className="text-xs w-[100px]">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {values.map((v) => (
              <TableRow key={v.id} className={v.isActive === 0 ? "opacity-50" : ""}>
                {editId === v.id ? (
                  <>
                    <TableCell><Input value={editKey} onChange={(e) => setEditKey(e.target.value)} className="h-6 text-xs" /></TableCell>
                    <TableCell><Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="h-6 text-xs" /></TableCell>
                    <TableCell>{v.isActive === 1 ? "Yes" : "No"}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-6" onClick={() => updateMut.mutate({ dimensionId, id: v.id, valueKey: editKey, valueLabel: editLabel, description: editDesc })} disabled={updateMut.isPending}><Save className="w-3 h-3" /></Button>
                      <Button size="sm" variant="ghost" className="h-6" onClick={() => setEditId(null)}>X</Button>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="font-mono text-xs">{v.valueKey}</TableCell>
                    <TableCell className="text-xs">{v.valueLabel}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" className="h-6" onClick={() => toggleMut.mutate({ dimensionId, id: v.id, isActive: v.isActive === 1 ? 0 : 1 })} disabled={!isDraft}>
                        <Badge variant="outline" className={`text-[10px] ${v.isActive === 1 ? "text-green-600" : "text-red-600"}`}>{v.isActive === 1 ? "Yes" : "No"}</Badge>
                      </Button>
                    </TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setEditId(v.id); setEditKey(v.valueKey); setEditLabel(v.valueLabel); setEditDesc(v.description || ""); }} disabled={!isDraft}>Edit</Button>
                      {isDraft && (
                        <Button size="sm" variant="ghost" className="h-6 text-red-600" onClick={() => { if (confirm(`Delete value "${v.valueKey}"?`)) deleteMut.mutate({ dimensionId, id: v.id }); }} disabled={deleteMut.isPending}><Trash2 className="w-3 h-3" /></Button>
                      )}
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {(!values || values.length === 0) && (
        <p className="text-xs text-muted-foreground">No values defined.</p>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Dimension Value</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Value Key</Label><Input placeholder="e.g., software" value={newKey} onChange={(e) => setNewKey(e.target.value)} /></div>
            <div><Label>Value Label</Label><Input placeholder="e.g., Software" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} /></div>
            <div><Label>Description</Label><Input placeholder="Optional" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate({ dimensionId, valueKey: newKey, valueLabel: newLabel, description: newDesc || undefined })} disabled={!newKey.trim() || !newLabel.trim() || createMut.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
