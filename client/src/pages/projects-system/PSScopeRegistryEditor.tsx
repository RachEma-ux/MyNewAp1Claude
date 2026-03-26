/**
 * PSScopeRegistryEditor — Scopes tab
 *
 * CRUD for scopes. Delete only in draft versions.
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { PSVersionSelector } from "./PSControlPanelPage";

export function PSScopeRegistryEditor({
  workspaceId,
  selectedVersionId,
  onSelectVersion,
}: {
  workspaceId: number;
  selectedVersionId: number | null;
  onSelectVersion: (id: number) => void;
}) {
  const utils = trpc.useUtils();
  const { data: scopes, isLoading } = trpc.ps.matrix.getAllScopes.useQuery(
    { workspaceId, versionId: selectedVersionId! },
    { enabled: !!selectedVersionId },
  );
  const { data: version } = trpc.ps.matrix.getVersion.useQuery(
    { workspaceId, id: selectedVersionId! },
    { enabled: !!selectedVersionId },
  );

  const isDraft = version?.status === "draft";

  const [showCreate, setShowCreate] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newFamily, setNewFamily] = useState("");

  const [editId, setEditId] = useState<number | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editFamily, setEditFamily] = useState("");

  const invalidate = () => { utils.ps.matrix.getAllScopes.invalidate(); utils.ps.matrix.getOverview.invalidate(); utils.ps.matrix.getGrid.invalidate(); };

  const createMut = trpc.ps.matrix.createScope.useMutation({
    onSuccess: () => { invalidate(); setShowCreate(false); setNewCode(""); setNewLabel(""); setNewDesc(""); setNewFamily(""); toast.success("Scope created"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.ps.matrix.updateScope.useMutation({
    onSuccess: () => { invalidate(); setEditId(null); toast.success("Scope updated"); },
    onError: (e) => toast.error(e.message),
  });

  const toggleMut = trpc.ps.matrix.updateScope.useMutation({
    onSuccess: () => { invalidate(); toast.success("Scope toggled"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.ps.matrix.deleteScope.useMutation({
    onSuccess: () => { invalidate(); toast.success("Scope deleted"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <PSVersionSelector workspaceId={workspaceId} selectedVersionId={selectedVersionId} onSelectVersion={onSelectVersion} />
      {!selectedVersionId ? null : isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Scopes ({scopes?.length ?? 0})</h2>
            <Button size="sm" onClick={() => setShowCreate(true)} disabled={!isDraft}><Plus className="w-4 h-4 mr-1" />Add Scope</Button>
          </div>
          {!isDraft && <p className="text-xs text-yellow-600">Read-only: only draft versions can be edited.</p>}

          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Code</TableHead><TableHead>Label</TableHead><TableHead>Family</TableHead><TableHead>Active</TableHead><TableHead className="w-[120px]">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {scopes?.map((s) => (
                  <TableRow key={s.id} className={s.isActive === 0 ? "opacity-50" : ""}>
                    {editId === s.id ? (
                      <>
                        <TableCell><Input value={editCode} onChange={(e) => setEditCode(e.target.value)} className="h-7 text-xs" /></TableCell>
                        <TableCell><Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="h-7 text-xs" /></TableCell>
                        <TableCell><Input value={editFamily} onChange={(e) => setEditFamily(e.target.value)} className="h-7 text-xs" /></TableCell>
                        <TableCell>{s.isActive === 1 ? "Yes" : "No"}</TableCell>
                        <TableCell className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => updateMut.mutate({ workspaceId, versionId: selectedVersionId!, id: s.id, code: editCode, label: editLabel, description: editDesc, family: editFamily })} disabled={updateMut.isPending}><Save className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>X</Button>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="font-mono text-xs">{s.code}</TableCell>
                        <TableCell>{s.label}</TableCell>
                        <TableCell className="text-muted-foreground">{s.family || "\u2014"}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => toggleMut.mutate({ workspaceId, versionId: selectedVersionId!, id: s.id, isActive: s.isActive === 1 ? 0 : 1 })} disabled={!isDraft}>
                            <Badge variant="outline" className={s.isActive === 1 ? "text-green-600" : "text-red-600"}>{s.isActive === 1 ? "Yes" : "No"}</Badge>
                          </Button>
                        </TableCell>
                        <TableCell className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setEditId(s.id); setEditCode(s.code); setEditLabel(s.label); setEditDesc(s.description || ""); setEditFamily(s.family || ""); }} disabled={!isDraft}>Edit</Button>
                          {isDraft && (
                            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => { if (confirm(`Delete scope "${s.code}"?`)) deleteMut.mutate({ workspaceId, versionId: selectedVersionId!, id: s.id }); }} disabled={deleteMut.isPending}><Trash2 className="w-3.5 h-3.5" /></Button>
                          )}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>

          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Scope</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Code</Label><Input placeholder="SCOPE_CODE" value={newCode} onChange={(e) => setNewCode(e.target.value)} /></div>
                <div><Label>Label</Label><Input placeholder="Scope Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} /></div>
                <div><Label>Description</Label><Input placeholder="Optional" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} /></div>
                <div><Label>Family</Label><Input placeholder="Optional family group" value={newFamily} onChange={(e) => setNewFamily(e.target.value)} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button onClick={() => createMut.mutate({ workspaceId, versionId: selectedVersionId!, code: newCode, label: newLabel, description: newDesc || undefined, family: newFamily || undefined })} disabled={!newCode.trim() || !newLabel.trim() || createMut.isPending}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
