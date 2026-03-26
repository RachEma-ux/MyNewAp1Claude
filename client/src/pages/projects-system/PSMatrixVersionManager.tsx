/**
 * PSMatrixVersionManager — Versions tab
 *
 * Create, duplicate, activate, archive matrix versions.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Archive,
  CheckCircle2,
  Copy,
  Loader2,
  Plus,
} from "lucide-react";

function statusColor(s: string) {
  if (s === "active") return "text-green-600 border-green-500/30";
  if (s === "draft") return "text-yellow-600 border-yellow-500/30";
  return "text-muted-foreground";
}

function formatDate(ts: string | Date | null | undefined): string {
  if (!ts) return "\u2014";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function PSMatrixVersionManager({
  selectedVersionId,
  onSelectVersion,
}: {
  selectedVersionId: number | null;
  onSelectVersion: (id: number) => void;
}) {
  const utils = trpc.useUtils();
  const { data: versions, isLoading } = trpc.ps.matrix.listVersions.useQuery();
  const [showCreate, setShowCreate] = useState(false);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [newVersion, setNewVersion] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [dupSourceId, setDupSourceId] = useState<number | null>(null);

  const createMut = trpc.ps.matrix.createVersion.useMutation({
    onSuccess: () => { utils.ps.matrix.listVersions.invalidate(); utils.ps.matrix.getOverview.invalidate(); setShowCreate(false); setNewVersion(""); setNewLabel(""); toast.success("Draft version created"); },
    onError: (e) => toast.error(e.message),
  });

  const dupMut = trpc.ps.matrix.duplicateVersion.useMutation({
    onSuccess: () => { utils.ps.matrix.listVersions.invalidate(); utils.ps.matrix.getOverview.invalidate(); setShowDuplicate(false); setNewVersion(""); setNewLabel(""); toast.success("Version duplicated"); },
    onError: (e) => toast.error(e.message),
  });

  const activateMut = trpc.ps.matrix.activateVersion.useMutation({
    onSuccess: () => { utils.ps.matrix.listVersions.invalidate(); utils.ps.matrix.getOverview.invalidate(); toast.success("Version activated"); },
    onError: (e) => toast.error(e.message),
  });

  const archiveMut = trpc.ps.matrix.archiveVersion.useMutation({
    onSuccess: () => { utils.ps.matrix.listVersions.invalidate(); utils.ps.matrix.getOverview.invalidate(); toast.success("Version archived"); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin mx-auto mt-8" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Matrix Versions</h2>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1" />New Draft</Button>
      </div>

      {(!versions || versions.length === 0) ? (
        <p className="text-sm text-muted-foreground">No versions yet. Create your first draft version.</p>
      ) : (
        <div className="space-y-2">
          {versions.map((v) => (
            <Card key={v.id} className={selectedVersionId === v.id ? "ring-2 ring-primary" : ""}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="cursor-pointer" onClick={() => onSelectVersion(v.id)}>
                  <span className="font-medium">{v.version}</span>
                  <span className="text-muted-foreground text-sm ml-2">{v.label}</span>
                  <Badge variant="outline" className={`ml-2 ${statusColor(v.status)}`}>{v.status}</Badge>
                  <span className="text-xs text-muted-foreground ml-2">Created {formatDate(v.createdAt)}</span>
                  {v.activatedAt && <span className="text-xs text-muted-foreground ml-2">Activated {formatDate(v.activatedAt)}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setDupSourceId(v.id); setShowDuplicate(true); }} title="Duplicate"><Copy className="w-3.5 h-3.5" /></Button>
                  {v.status === "draft" && (
                    <Button size="sm" variant="ghost" className="text-green-600" onClick={() => activateMut.mutate({ id: v.id })} disabled={activateMut.isPending} title="Activate"><CheckCircle2 className="w-3.5 h-3.5" /></Button>
                  )}
                  {v.status !== "active" && v.status !== "archived" && (
                    <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => archiveMut.mutate({ id: v.id })} disabled={archiveMut.isPending} title="Archive"><Archive className="w-3.5 h-3.5" /></Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Draft Version</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Version Code</Label><Input placeholder="e.g., v2.0" value={newVersion} onChange={(e) => setNewVersion(e.target.value)} /></div>
            <div><Label>Label</Label><Input placeholder="e.g., Full Matrix v2" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate({ version: newVersion, label: newLabel })} disabled={!newVersion.trim() || !newLabel.trim() || createMut.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDuplicate} onOpenChange={setShowDuplicate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Duplicate Version</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Duplicating from version ID {dupSourceId}. All scopes, questions, cells, and dimensions will be copied.</p>
            <div><Label>New Version Code</Label><Input placeholder="e.g., v1.1-copy" value={newVersion} onChange={(e) => setNewVersion(e.target.value)} /></div>
            <div><Label>New Label</Label><Input placeholder="e.g., Copy of Full Matrix" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDuplicate(false)}>Cancel</Button>
            <Button onClick={() => dupSourceId && dupMut.mutate({ sourceVersionId: dupSourceId, newVersion, newLabel })} disabled={!newVersion.trim() || !newLabel.trim() || dupMut.isPending}>Duplicate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
