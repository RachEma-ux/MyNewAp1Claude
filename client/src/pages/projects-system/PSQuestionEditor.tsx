/**
 * PSQuestionEditor — Questions tab
 *
 * CRUD for questions. Delete only in draft versions.
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

export function PSQuestionEditor({
  workspaceId,
  selectedVersionId,
  onSelectVersion,
}: {
  workspaceId: number;
  selectedVersionId: number | null;
  onSelectVersion: (id: number) => void;
}) {
  const utils = trpc.useUtils();
  const { data: questions, isLoading } = trpc.ps.matrix.getAllQuestions.useQuery(
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

  const [editId, setEditId] = useState<number | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const invalidate = () => { utils.ps.matrix.getAllQuestions.invalidate(); utils.ps.matrix.getOverview.invalidate(); utils.ps.matrix.getGrid.invalidate(); };

  const createMut = trpc.ps.matrix.createQuestion.useMutation({
    onSuccess: () => { invalidate(); setShowCreate(false); setNewCode(""); setNewLabel(""); setNewDesc(""); toast.success("Question created"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.ps.matrix.updateQuestion.useMutation({
    onSuccess: () => { invalidate(); setEditId(null); toast.success("Question updated"); },
    onError: (e) => toast.error(e.message),
  });

  const toggleMut = trpc.ps.matrix.updateQuestion.useMutation({
    onSuccess: () => { invalidate(); toast.success("Question toggled"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.ps.matrix.deleteQuestion.useMutation({
    onSuccess: () => { invalidate(); toast.success("Question deleted"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <PSVersionSelector workspaceId={workspaceId} selectedVersionId={selectedVersionId} onSelectVersion={onSelectVersion} />
      {!selectedVersionId ? null : isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Questions ({questions?.length ?? 0})</h2>
            <Button size="sm" onClick={() => setShowCreate(true)} disabled={!isDraft}><Plus className="w-4 h-4 mr-1" />Add Question</Button>
          </div>
          {!isDraft && <p className="text-xs text-yellow-600">Read-only: only draft versions can be edited.</p>}

          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-[40px]">#</TableHead>
                <TableHead>Code</TableHead><TableHead>Label</TableHead><TableHead>Active</TableHead><TableHead className="w-[120px]">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {questions?.map((q) => (
                  <TableRow key={q.id} className={q.isActive === 0 ? "opacity-50" : ""}>
                    {editId === q.id ? (
                      <>
                        <TableCell>{q.sortOrder}</TableCell>
                        <TableCell><Input value={editCode} onChange={(e) => setEditCode(e.target.value)} className="h-7 text-xs" /></TableCell>
                        <TableCell><Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="h-7 text-xs" /></TableCell>
                        <TableCell>{q.isActive === 1 ? "Yes" : "No"}</TableCell>
                        <TableCell className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => updateMut.mutate({ workspaceId, versionId: selectedVersionId!, id: q.id, code: editCode, label: editLabel, description: editDesc })} disabled={updateMut.isPending}><Save className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>X</Button>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="text-muted-foreground">{q.sortOrder}</TableCell>
                        <TableCell className="font-mono text-xs">{q.code}</TableCell>
                        <TableCell>{q.label}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => toggleMut.mutate({ workspaceId, versionId: selectedVersionId!, id: q.id, isActive: q.isActive === 1 ? 0 : 1 })} disabled={!isDraft}>
                            <Badge variant="outline" className={q.isActive === 1 ? "text-green-600" : "text-red-600"}>{q.isActive === 1 ? "Yes" : "No"}</Badge>
                          </Button>
                        </TableCell>
                        <TableCell className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setEditId(q.id); setEditCode(q.code); setEditLabel(q.label); setEditDesc(q.description || ""); }} disabled={!isDraft}>Edit</Button>
                          {isDraft && (
                            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => { if (confirm(`Delete question "${q.code}"?`)) deleteMut.mutate({ workspaceId, versionId: selectedVersionId!, id: q.id }); }} disabled={deleteMut.isPending}><Trash2 className="w-3.5 h-3.5" /></Button>
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
              <DialogHeader><DialogTitle>Add Question</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Code</Label><Input placeholder="Q_CODE" value={newCode} onChange={(e) => setNewCode(e.target.value)} /></div>
                <div><Label>Label</Label><Input placeholder="Question text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} /></div>
                <div><Label>Description</Label><Input placeholder="Optional" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button onClick={() => createMut.mutate({ workspaceId, versionId: selectedVersionId!, code: newCode, label: newLabel, description: newDesc || undefined })} disabled={!newCode.trim() || !newLabel.trim() || createMut.isPending}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
