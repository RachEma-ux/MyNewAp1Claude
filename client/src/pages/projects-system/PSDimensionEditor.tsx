/**
 * PSDimensionEditor — Dimensions tab
 *
 * CRUD for dimensions. Includes inline PSDimensionValueEditor.
 * Delete only in draft versions.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { PSDimensionValueEditor } from "./PSDimensionValueEditor";
import { PSVersionSelector } from "./PSControlPanelPage";

export function PSDimensionEditor({
  workspaceId,
  selectedVersionId,
  onSelectVersion,
}: {
  workspaceId: number;
  selectedVersionId: number | null;
  onSelectVersion: (id: number) => void;
}) {
  const utils = trpc.useUtils();
  const { data: dimensions, isLoading } = trpc.ps.matrix.listAllDimensions.useQuery(
    { workspaceId, versionId: selectedVersionId! },
    { enabled: !!selectedVersionId },
  );
  const { data: version } = trpc.ps.matrix.getVersion.useQuery(
    { workspaceId, id: selectedVersionId! },
    { enabled: !!selectedVersionId },
  );

  const isDraft = version?.status === "draft";

  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [editId, setEditId] = useState<number | null>(null);
  const [editKey, setEditKey] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const [expandedId, setExpandedId] = useState<number | null>(null);

  const invalidate = () => { utils.ps.matrix.listAllDimensions.invalidate(); utils.ps.matrix.getOverview.invalidate(); };

  const createMut = trpc.ps.matrix.createDimension.useMutation({
    onSuccess: () => { invalidate(); setShowCreate(false); setNewKey(""); setNewLabel(""); setNewDesc(""); toast.success("Dimension created"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.ps.matrix.updateDimension.useMutation({
    onSuccess: () => { invalidate(); setEditId(null); toast.success("Dimension updated"); },
    onError: (e) => toast.error(e.message),
  });

  const toggleMut = trpc.ps.matrix.updateDimension.useMutation({
    onSuccess: () => { invalidate(); toast.success("Dimension toggled"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.ps.matrix.deleteDimension.useMutation({
    onSuccess: () => { invalidate(); setExpandedId(null); toast.success("Dimension deleted"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <PSVersionSelector workspaceId={workspaceId} selectedVersionId={selectedVersionId} onSelectVersion={onSelectVersion} />
      {!selectedVersionId ? null : isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Dimensions ({dimensions?.length ?? 0})</h2>
            <Button size="sm" onClick={() => setShowCreate(true)} disabled={!isDraft}><Plus className="w-4 h-4 mr-1" />Add Dimension</Button>
          </div>
          {!isDraft && <p className="text-xs text-yellow-600">Read-only: only draft versions can be edited.</p>}

          <div className="space-y-2">
            {dimensions?.map((dim) => (
              <Card key={dim.id} className={dim.isActive === 0 ? "opacity-50" : ""}>
                <CardContent className="py-3 px-4 space-y-2">
                  {editId === dim.id ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input value={editKey} onChange={(e) => setEditKey(e.target.value)} className="h-7 text-xs max-w-[150px]" placeholder="Key" />
                      <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="h-7 text-xs max-w-[200px]" placeholder="Label" />
                      <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="h-7 text-xs max-w-[250px]" placeholder="Description" />
                      <Button size="sm" variant="ghost" onClick={() => updateMut.mutate({ workspaceId, versionId: selectedVersionId!, id: dim.id, dimensionKey: editKey, dimensionLabel: editLabel, description: editDesc })} disabled={updateMut.isPending}><Save className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>X</Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpandedId(expandedId === dim.id ? null : dim.id)}>
                        {expandedId === dim.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <span className="font-mono text-xs">{dim.dimensionKey}</span>
                        <span className="font-medium">{dim.dimensionLabel}</span>
                        <Badge variant="outline" className={dim.isActive === 1 ? "text-green-600" : "text-red-600"}>{dim.isActive === 1 ? "Active" : "Inactive"}</Badge>
                        {dim.description && <span className="text-xs text-muted-foreground">{dim.description}</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => toggleMut.mutate({ workspaceId, versionId: selectedVersionId!, id: dim.id, isActive: dim.isActive === 1 ? 0 : 1 })} disabled={!isDraft}>
                          Toggle
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditId(dim.id); setEditKey(dim.dimensionKey); setEditLabel(dim.dimensionLabel); setEditDesc(dim.description || ""); }} disabled={!isDraft}>Edit</Button>
                        {isDraft && (
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => { if (confirm(`Delete dimension "${dim.dimensionKey}" and all its values?`)) deleteMut.mutate({ workspaceId, versionId: selectedVersionId!, id: dim.id }); }} disabled={deleteMut.isPending}><Trash2 className="w-3.5 h-3.5" /></Button>
                        )}
                      </div>
                    </div>
                  )}

                  {expandedId === dim.id && (
                    <PSDimensionValueEditor
                      workspaceId={workspaceId}
                      dimensionId={dim.id}
                      isDraft={isDraft}
                    />
                  )}
                </CardContent>
              </Card>
            ))}

            {(!dimensions || dimensions.length === 0) && (
              <p className="text-sm text-muted-foreground">No dimensions defined for this version.</p>
            )}
          </div>

          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Dimension</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Dimension Key</Label><Input placeholder="e.g., domain" value={newKey} onChange={(e) => setNewKey(e.target.value)} /></div>
                <div><Label>Label</Label><Input placeholder="e.g., Domain" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} /></div>
                <div><Label>Description</Label><Input placeholder="Optional" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button onClick={() => createMut.mutate({ workspaceId, versionId: selectedVersionId!, dimensionKey: newKey, dimensionLabel: newLabel, description: newDesc || undefined })} disabled={!newKey.trim() || !newLabel.trim() || createMut.isPending}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
