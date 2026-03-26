/**
 * OM Wizard Settings — Alignment Matrix Version Management
 *
 * Lists matrix versions, allows create/publish/archive.
 * Links to the Structure Types Matrix editor.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, CheckCircle, Archive, Grid3X3 } from "lucide-react";

interface Props {
  workspaceId: number;
  onNavigateToMatrix?: (matrixVersionId: number) => void;
}

export function OMWizardSettingsPage({ workspaceId, onNavigateToMatrix }: Props) {
  const utils = trpc.useUtils();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const versions = trpc.organizationManagement.alignmentMatrix.versions.list.useQuery({ workspaceId });
  const createVersion = trpc.organizationManagement.alignmentMatrix.versions.create.useMutation();
  const publishVersion = trpc.organizationManagement.alignmentMatrix.versions.publish.useMutation();
  const archiveVersion = trpc.organizationManagement.alignmentMatrix.versions.archive.useMutation();

  async function handleCreate() {
    if (!newName.trim()) return;
    await createVersion.mutateAsync({ workspaceId, name: newName, description: newDesc || undefined });
    setNewName("");
    setNewDesc("");
    setShowCreate(false);
    await utils.organizationManagement.alignmentMatrix.versions.list.invalidate();
  }

  async function handlePublish(id: number) {
    await publishVersion.mutateAsync({ workspaceId, id });
    await utils.organizationManagement.alignmentMatrix.versions.list.invalidate();
  }

  async function handleArchive(id: number) {
    await archiveVersion.mutateAsync({ workspaceId, id });
    await utils.organizationManagement.alignmentMatrix.versions.list.invalidate();
  }

  const statusColor: Record<string, string> = {
    draft: "bg-amber-500/20 text-amber-600",
    active: "bg-green-500/20 text-green-600",
    archived: "bg-gray-500/20 text-gray-500",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Alignment Matrix Versions</h2>
        <Button size="sm" variant="outline" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="w-4 h-4 mr-1" /> New Version
        </Button>
      </div>

      {showCreate && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 space-y-3">
            <div><Label>Version Name</Label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. v2 — Updated Legal Structures" /></div>
            <div><Label>Description</Label><Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What changed..." rows={2} /></div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || createVersion.isPending}>
                {createVersion.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Create
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {versions.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading versions...</div>
      ) : (versions.data ?? []).length === 0 ? (
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">No alignment matrix versions yet. The system seeds v1 on startup.</p></CardContent></Card>
      ) : (
        (versions.data ?? []).map((v: any) => (
          <Card key={v.id}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-medium text-sm">{v.name}</span>
                  <Badge className={`ml-2 text-xs ${statusColor[v.status] ?? ""}`}>{v.status}</Badge>
                </div>
                <div className="flex gap-1">
                  {v.status === "draft" && (
                    <Button size="sm" variant="outline" onClick={() => handlePublish(v.id)} disabled={publishVersion.isPending}>
                      <CheckCircle className="w-3 h-3 mr-1" /> Publish
                    </Button>
                  )}
                  {v.status === "active" && (
                    <Button size="sm" variant="ghost" onClick={() => handleArchive(v.id)} disabled={archiveVersion.isPending}>
                      <Archive className="w-3 h-3 mr-1" /> Archive
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => onNavigateToMatrix?.(v.id)}>
                    <Grid3X3 className="w-3 h-3 mr-1" /> Edit Matrix
                  </Button>
                </div>
              </div>
              {v.description && <p className="text-xs text-muted-foreground">{v.description}</p>}
              {v.publishedAt && <p className="text-xs text-muted-foreground mt-1">Published: {new Date(v.publishedAt).toLocaleDateString()}</p>}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

export default OMWizardSettingsPage;
