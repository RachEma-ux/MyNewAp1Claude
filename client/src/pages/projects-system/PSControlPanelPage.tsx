/**
 * PS Control Panel — Matrix Admin Surface
 *
 * Provides: matrix overview, version management, import center,
 * scope editor, question editor, matrix grid editor, validation panel.
 */
import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Copy,
  Download,
  Grid3X3,
  Loader2,
  Plus,
  Save,
  Shield,
  Upload,
  Zap,
  LayoutGrid,
  List,
  FileQuestion,
  Target,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────

function formatDate(ts: string | Date | null | undefined): string {
  if (!ts) return "\u2014";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function statusColor(s: string) {
  if (s === "active") return "text-green-600 border-green-500/30";
  if (s === "draft") return "text-yellow-600 border-yellow-500/30";
  return "text-muted-foreground";
}

// ── Main Component ───────────────────────────────────────────────────

export function PSControlPanelPage({ workspaceId }: { workspaceId: number }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">PS Control Panel</h1>
        <Badge variant="outline" className="text-indigo-600 border-indigo-500/30">
          Matrix Admin
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview"><LayoutGrid className="w-3.5 h-3.5 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="versions"><List className="w-3.5 h-3.5 mr-1" />Versions</TabsTrigger>
          <TabsTrigger value="import"><Upload className="w-3.5 h-3.5 mr-1" />Import</TabsTrigger>
          <TabsTrigger value="scopes"><Target className="w-3.5 h-3.5 mr-1" />Scopes</TabsTrigger>
          <TabsTrigger value="questions"><FileQuestion className="w-3.5 h-3.5 mr-1" />Questions</TabsTrigger>
          <TabsTrigger value="grid"><Grid3X3 className="w-3.5 h-3.5 mr-1" />Grid</TabsTrigger>
          <TabsTrigger value="validation"><Shield className="w-3.5 h-3.5 mr-1" />Validation</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab workspaceId={workspaceId} onSelectVersion={setSelectedVersionId} onChangeTab={setActiveTab} />
        </TabsContent>
        <TabsContent value="versions">
          <VersionsTab workspaceId={workspaceId} selectedVersionId={selectedVersionId} onSelectVersion={setSelectedVersionId} />
        </TabsContent>
        <TabsContent value="import">
          <ImportTab workspaceId={workspaceId} />
        </TabsContent>
        <TabsContent value="scopes">
          <ScopesTab workspaceId={workspaceId} selectedVersionId={selectedVersionId} onSelectVersion={setSelectedVersionId} />
        </TabsContent>
        <TabsContent value="questions">
          <QuestionsTab workspaceId={workspaceId} selectedVersionId={selectedVersionId} onSelectVersion={setSelectedVersionId} />
        </TabsContent>
        <TabsContent value="grid">
          <GridTab workspaceId={workspaceId} selectedVersionId={selectedVersionId} onSelectVersion={setSelectedVersionId} />
        </TabsContent>
        <TabsContent value="validation">
          <ValidationTab workspaceId={workspaceId} selectedVersionId={selectedVersionId} onSelectVersion={setSelectedVersionId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Version Selector ─────────────────────────────────────────────────

function VersionSelector({
  workspaceId,
  selectedVersionId,
  onSelectVersion,
}: {
  workspaceId: number;
  selectedVersionId: number | null;
  onSelectVersion: (id: number) => void;
}) {
  const { data: versions } = trpc.ps.matrix.listVersions.useQuery({ workspaceId });

  if (!versions || versions.length === 0) {
    return <p className="text-sm text-muted-foreground">No versions. Create one in the Versions tab.</p>;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-muted-foreground">Version:</span>
      {versions.map((v) => (
        <Button
          key={v.id}
          size="sm"
          variant={selectedVersionId === v.id ? "default" : "outline"}
          onClick={() => onSelectVersion(v.id)}
          className="text-xs"
        >
          {v.version} <Badge variant="outline" className={`ml-1 text-[10px] ${statusColor(v.status)}`}>{v.status}</Badge>
        </Button>
      ))}
    </div>
  );
}

// ── A. Overview Tab ─────────────────────────────────────────────────

function OverviewTab({
  workspaceId,
  onSelectVersion,
  onChangeTab,
}: {
  workspaceId: number;
  onSelectVersion: (id: number) => void;
  onChangeTab: (tab: string) => void;
}) {
  const { data, isLoading } = trpc.ps.matrix.getOverview.useQuery({ workspaceId });

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin mx-auto mt-8" />;
  if (!data) return <p className="text-sm text-muted-foreground">Unable to load overview.</p>;

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-green-500" />Active Version</CardTitle></CardHeader>
        <CardContent>
          {data.activeVersion ? (
            <div className="space-y-1">
              <p className="font-medium">{data.activeVersion.version}</p>
              <p className="text-xs text-muted-foreground">{data.activeVersion.label}</p>
              <p className="text-xs text-muted-foreground">Activated: {formatDate(data.activeVersion.activatedAt)}</p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 text-xs"
                onClick={() => { onSelectVersion(data.activeVersion!.id); onChangeTab("grid"); }}
              >
                View Grid
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active version</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Grid3X3 className="w-4 h-4 text-indigo-500" />Matrix Stats</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Total Versions</span><span className="font-medium">{data.totalVersions}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Scopes (active)</span><span className="font-medium">{data.totalScopes}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Questions (active)</span><span className="font-medium">{data.totalQuestions}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Cells</span><span className="font-medium">{data.totalCells}</span></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-orange-500" />Activity</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Last Import</span><span>{formatDate(data.lastImportAt)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Last Activation</span><span>{formatDate(data.lastActivationAt)}</span></div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── B. Versions Tab ──────────────────────────────────────────────────

function VersionsTab({
  workspaceId,
  selectedVersionId,
  onSelectVersion,
}: {
  workspaceId: number;
  selectedVersionId: number | null;
  onSelectVersion: (id: number) => void;
}) {
  const utils = trpc.useUtils();
  const { data: versions, isLoading } = trpc.ps.matrix.listVersions.useQuery({ workspaceId });
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
                    <Button size="sm" variant="ghost" className="text-green-600" onClick={() => activateMut.mutate({ workspaceId, id: v.id })} disabled={activateMut.isPending} title="Activate"><CheckCircle2 className="w-3.5 h-3.5" /></Button>
                  )}
                  {v.status !== "active" && v.status !== "archived" && (
                    <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => archiveMut.mutate({ workspaceId, id: v.id })} disabled={archiveMut.isPending} title="Archive"><Archive className="w-3.5 h-3.5" /></Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Draft Version</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Version Code</Label><Input placeholder="e.g., v2.0" value={newVersion} onChange={(e) => setNewVersion(e.target.value)} /></div>
            <div><Label>Label</Label><Input placeholder="e.g., Full Matrix v2" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate({ workspaceId, version: newVersion, label: newLabel })} disabled={!newVersion.trim() || !newLabel.trim() || createMut.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Dialog */}
      <Dialog open={showDuplicate} onOpenChange={setShowDuplicate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Duplicate Version</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Duplicating from version ID {dupSourceId}. All scopes, questions, and cells will be copied.</p>
            <div><Label>New Version Code</Label><Input placeholder="e.g., v1.1-copy" value={newVersion} onChange={(e) => setNewVersion(e.target.value)} /></div>
            <div><Label>New Label</Label><Input placeholder="e.g., Copy of Full Matrix" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDuplicate(false)}>Cancel</Button>
            <Button onClick={() => dupSourceId && dupMut.mutate({ workspaceId, sourceVersionId: dupSourceId, newVersion, newLabel })} disabled={!newVersion.trim() || !newLabel.trim() || dupMut.isPending}>Duplicate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── C. Import Tab ────────────────────────────────────────────────────

function ImportTab({ workspaceId }: { workspaceId: number }) {
  const utils = trpc.useUtils();
  const [jsonInput, setJsonInput] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [commitVersion, setCommitVersion] = useState("");
  const [commitLabel, setCommitLabel] = useState("");

  const previewMut = trpc.ps.matrix.previewImport.useMutation({
    onSuccess: (data) => { setPreview(data); if (data.isValid) toast.success("Import preview valid"); else toast.error("Import has errors"); },
    onError: (e) => toast.error(e.message),
  });

  const commitMut = trpc.ps.matrix.commitImport.useMutation({
    onSuccess: (data) => {
      utils.ps.matrix.listVersions.invalidate();
      utils.ps.matrix.getOverview.invalidate();
      toast.success(`Imported: ${data.scopesCreated} scopes, ${data.questionsCreated} questions, ${data.cellsCreated} cells`);
      setPreview(null);
      setJsonInput("");
      setCommitVersion("");
      setCommitLabel("");
    },
    onError: (e) => toast.error(e.message),
  });

  const handlePreview = () => {
    try {
      const payload = JSON.parse(jsonInput);
      if (!payload.scopes || !payload.questions || !payload.cells) {
        toast.error("JSON must have scopes, questions, and cells arrays");
        return;
      }
      previewMut.mutate({
        workspaceId,
        sourceType: "json",
        sourceName: "manual-paste",
        payload,
      });
    } catch {
      toast.error("Invalid JSON");
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Import Center</h2>
      <p className="text-sm text-muted-foreground">
        Paste a JSON payload with <code>scopes</code>, <code>questions</code>, and <code>cells</code> arrays.
        Each cell uses <code>questionCode</code> and <code>scopeCode</code> (not IDs).
      </p>

      <Textarea
        className="font-mono text-xs min-h-[200px]"
        placeholder={`{\n  "scopes": [{ "code": "SCOPE_A", "label": "Scope A" }],\n  "questions": [{ "code": "Q1", "label": "Question 1" }],\n  "cells": [{ "questionCode": "Q1", "scopeCode": "SCOPE_A", "weight": 3 }]\n}`}
        value={jsonInput}
        onChange={(e) => setJsonInput(e.target.value)}
      />

      <Button onClick={handlePreview} disabled={!jsonInput.trim() || previewMut.isPending}>
        {previewMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
        Preview Import
      </Button>

      {preview && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Import Preview</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-4">
              <span>Scopes: <strong>{preview.scopesCount}</strong></span>
              <span>Questions: <strong>{preview.questionsCount}</strong></span>
              <span>Cells: <strong>{preview.cellsCount}</strong></span>
            </div>
            {preview.warnings.length > 0 && (
              <div className="rounded border border-yellow-500/30 bg-yellow-500/5 p-2 space-y-1">
                {preview.warnings.map((w: string, i: number) => (
                  <p key={i} className="text-yellow-600 text-xs flex items-start gap-1"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{w}</p>
                ))}
              </div>
            )}
            {preview.errors.length > 0 && (
              <div className="rounded border border-red-500/30 bg-red-500/5 p-2 space-y-1">
                {preview.errors.map((e: string, i: number) => (
                  <p key={i} className="text-red-600 text-xs">{e}</p>
                ))}
              </div>
            )}
            {preview.isValid && (
              <div className="space-y-3 pt-2 border-t">
                <p className="text-xs text-muted-foreground">Create a new draft version for this import:</p>
                <div className="flex gap-2">
                  <Input placeholder="Version code" value={commitVersion} onChange={(e) => setCommitVersion(e.target.value)} className="max-w-[200px]" />
                  <Input placeholder="Label" value={commitLabel} onChange={(e) => setCommitLabel(e.target.value)} className="max-w-[300px]" />
                  <Button
                    onClick={() => commitMut.mutate({ workspaceId, importId: preview.importId, newVersion: commitVersion, newLabel: commitLabel })}
                    disabled={!commitVersion.trim() || !commitLabel.trim() || commitMut.isPending}
                  >
                    {commitMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
                    Commit
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── D. Scopes Tab ────────────────────────────────────────────────────

function ScopesTab({
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

  const createMut = trpc.ps.matrix.createScope.useMutation({
    onSuccess: () => { utils.ps.matrix.getAllScopes.invalidate(); utils.ps.matrix.getOverview.invalidate(); setShowCreate(false); setNewCode(""); setNewLabel(""); setNewDesc(""); setNewFamily(""); toast.success("Scope created"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.ps.matrix.updateScope.useMutation({
    onSuccess: () => { utils.ps.matrix.getAllScopes.invalidate(); setEditId(null); toast.success("Scope updated"); },
    onError: (e) => toast.error(e.message),
  });

  const toggleMut = trpc.ps.matrix.updateScope.useMutation({
    onSuccess: () => { utils.ps.matrix.getAllScopes.invalidate(); toast.success("Scope toggled"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <VersionSelector workspaceId={workspaceId} selectedVersionId={selectedVersionId} onSelectVersion={onSelectVersion} />
      {!selectedVersionId ? null : isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Scopes ({scopes?.length ?? 0})</h2>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1" />Add Scope</Button>
          </div>

          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Code</TableHead><TableHead>Label</TableHead><TableHead>Family</TableHead><TableHead>Active</TableHead><TableHead className="w-[100px]">Actions</TableHead>
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
                        <TableCell>
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
                          <Button size="sm" variant="ghost" onClick={() => toggleMut.mutate({ workspaceId, versionId: selectedVersionId!, id: s.id, isActive: s.isActive === 1 ? 0 : 1 })}>
                            <Badge variant="outline" className={s.isActive === 1 ? "text-green-600" : "text-red-600"}>{s.isActive === 1 ? "Yes" : "No"}</Badge>
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => { setEditId(s.id); setEditCode(s.code); setEditLabel(s.label); setEditDesc(s.description || ""); setEditFamily(s.family || ""); }}>Edit</Button>
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

// ── E. Questions Tab ─────────────────────────────────────────────────

function QuestionsTab({
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

  const [showCreate, setShowCreate] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [editId, setEditId] = useState<number | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const createMut = trpc.ps.matrix.createQuestion.useMutation({
    onSuccess: () => { utils.ps.matrix.getAllQuestions.invalidate(); utils.ps.matrix.getOverview.invalidate(); setShowCreate(false); setNewCode(""); setNewLabel(""); setNewDesc(""); toast.success("Question created"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.ps.matrix.updateQuestion.useMutation({
    onSuccess: () => { utils.ps.matrix.getAllQuestions.invalidate(); setEditId(null); toast.success("Question updated"); },
    onError: (e) => toast.error(e.message),
  });

  const toggleMut = trpc.ps.matrix.updateQuestion.useMutation({
    onSuccess: () => { utils.ps.matrix.getAllQuestions.invalidate(); toast.success("Question toggled"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <VersionSelector workspaceId={workspaceId} selectedVersionId={selectedVersionId} onSelectVersion={onSelectVersion} />
      {!selectedVersionId ? null : isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Questions ({questions?.length ?? 0})</h2>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1" />Add Question</Button>
          </div>

          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-[40px]">#</TableHead>
                <TableHead>Code</TableHead><TableHead>Label</TableHead><TableHead>Active</TableHead><TableHead className="w-[100px]">Actions</TableHead>
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
                        <TableCell>
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
                          <Button size="sm" variant="ghost" onClick={() => toggleMut.mutate({ workspaceId, versionId: selectedVersionId!, id: q.id, isActive: q.isActive === 1 ? 0 : 1 })}>
                            <Badge variant="outline" className={q.isActive === 1 ? "text-green-600" : "text-red-600"}>{q.isActive === 1 ? "Yes" : "No"}</Badge>
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => { setEditId(q.id); setEditCode(q.code); setEditLabel(q.label); setEditDesc(q.description || ""); }}>Edit</Button>
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

// ── F. Grid Editor Tab (CORE UI) ────────────────────────────────────

function GridTab({
  workspaceId,
  selectedVersionId,
  onSelectVersion,
}: {
  workspaceId: number;
  selectedVersionId: number | null;
  onSelectVersion: (id: number) => void;
}) {
  const utils = trpc.useUtils();
  const { data: grid, isLoading } = trpc.ps.matrix.getGrid.useQuery(
    { workspaceId, versionId: selectedVersionId! },
    { enabled: !!selectedVersionId },
  );

  const [pendingChanges, setPendingChanges] = useState<Map<string, number>>(new Map());

  const upsertMut = trpc.ps.matrix.bulkUpsertCells.useMutation({
    onSuccess: () => {
      utils.ps.matrix.getGrid.invalidate();
      utils.ps.matrix.getOverview.invalidate();
      setPendingChanges(new Map());
      toast.success("Grid saved");
    },
    onError: (e) => toast.error(e.message),
  });

  // Build cell lookup: "questionId-scopeId" → weight
  const cellMap = useMemo(() => {
    const m = new Map<string, number>();
    if (grid?.cells) {
      for (const c of grid.cells) {
        m.set(`${c.questionId}-${c.scopeId}`, c.weight);
      }
    }
    return m;
  }, [grid]);

  const getWeight = useCallback((qId: number, sId: number): number => {
    const key = `${qId}-${sId}`;
    if (pendingChanges.has(key)) return pendingChanges.get(key)!;
    return cellMap.get(key) ?? 0;
  }, [cellMap, pendingChanges]);

  const setWeight = useCallback((qId: number, sId: number, val: string) => {
    const key = `${qId}-${sId}`;
    const num = parseInt(val, 10);
    setPendingChanges((prev) => {
      const next = new Map(prev);
      if (isNaN(num)) next.delete(key);
      else next.set(key, num);
      return next;
    });
  }, []);

  const handleSave = () => {
    if (!selectedVersionId || pendingChanges.size === 0) return;
    const items = Array.from(pendingChanges.entries()).map(([key, weight]) => {
      const [qId, sId] = key.split("-").map(Number);
      return { questionId: qId, scopeId: sId, weight };
    });
    upsertMut.mutate({ workspaceId, versionId: selectedVersionId, items });
  };

  const activeScopes = grid?.scopes?.filter((s) => s.isActive === 1) ?? [];
  const activeQuestions = grid?.questions?.filter((q) => q.isActive === 1) ?? [];

  return (
    <div className="space-y-4">
      <VersionSelector workspaceId={workspaceId} selectedVersionId={selectedVersionId} onSelectVersion={onSelectVersion} />
      {!selectedVersionId ? null : isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Matrix Grid
              <span className="text-sm font-normal text-muted-foreground ml-2">
                {activeQuestions.length} questions x {activeScopes.length} scopes
              </span>
            </h2>
            <Button onClick={handleSave} disabled={pendingChanges.size === 0 || upsertMut.isPending} size="sm">
              {upsertMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              Save ({pendingChanges.size} changes)
            </Button>
          </div>

          {activeScopes.length === 0 || activeQuestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {activeScopes.length === 0 ? "No active scopes." : "No active questions."} Add them in the Scopes/Questions tabs.
            </p>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">Question</TableHead>
                      {activeScopes.map((s) => (
                        <TableHead key={s.id} className="text-center min-w-[80px] text-xs">
                          <div className="truncate max-w-[80px]" title={s.label}>{s.code}</div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeQuestions.map((q) => (
                      <TableRow key={q.id}>
                        <TableCell className="sticky left-0 bg-background z-10 text-xs font-medium" title={q.label}>
                          <div className="truncate max-w-[200px]">{q.code}: {q.label}</div>
                        </TableCell>
                        {activeScopes.map((s) => {
                          const w = getWeight(q.id, s.id);
                          const key = `${q.id}-${s.id}`;
                          const isChanged = pendingChanges.has(key);
                          return (
                            <TableCell key={s.id} className="p-0.5 text-center">
                              <Input
                                type="number"
                                value={w}
                                onChange={(e) => setWeight(q.id, s.id, e.target.value)}
                                className={`h-7 w-16 text-center text-xs mx-auto ${isChanged ? "ring-1 ring-blue-500" : ""} ${w === 0 ? "text-muted-foreground" : "font-medium"}`}
                              />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          )}
        </>
      )}
    </div>
  );
}

// ── G. Validation Tab ────────────────────────────────────────────────

function ValidationTab({
  workspaceId,
  selectedVersionId,
  onSelectVersion,
}: {
  workspaceId: number;
  selectedVersionId: number | null;
  onSelectVersion: (id: number) => void;
}) {
  const utils = trpc.useUtils();
  const { data: report, isLoading, refetch } = trpc.ps.matrix.getValidationReport.useQuery(
    { workspaceId, versionId: selectedVersionId! },
    { enabled: !!selectedVersionId },
  );

  const activateMut = trpc.ps.matrix.activateVersion.useMutation({
    onSuccess: () => {
      utils.ps.matrix.listVersions.invalidate();
      utils.ps.matrix.getOverview.invalidate();
      toast.success("Version activated successfully!");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <VersionSelector workspaceId={workspaceId} selectedVersionId={selectedVersionId} onSelectVersion={onSelectVersion} />
      {!selectedVersionId ? null : isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : !report ? <p className="text-sm text-muted-foreground">Unable to load validation report.</p> : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Validation Report</h2>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => refetch()}>Re-validate</Button>
              {report.isValid && (
                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => activateMut.mutate({ workspaceId, id: selectedVersionId! })} disabled={activateMut.isPending}>
                  {activateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                  Activate Version
                </Button>
              )}
            </div>
          </div>

          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center gap-3">
                {report.isValid ? (
                  <Badge className="bg-green-600 text-white">VALID</Badge>
                ) : (
                  <Badge className="bg-red-600 text-white">INVALID — {report.errors.length} error(s)</Badge>
                )}
                <span className="text-sm text-muted-foreground">Coverage: {report.stats.coveragePercent}%</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span className="text-muted-foreground">Scopes</span> <span className="font-medium ml-1">{report.stats.activeScopeCount}/{report.stats.scopeCount}</span></div>
                <div><span className="text-muted-foreground">Questions</span> <span className="font-medium ml-1">{report.stats.activeQuestionCount}/{report.stats.questionCount}</span></div>
                <div><span className="text-muted-foreground">Cells</span> <span className="font-medium ml-1">{report.stats.cellCount}/{report.stats.expectedCellCount}</span></div>
                <div><span className="text-muted-foreground">Coverage</span> <span className="font-medium ml-1">{report.stats.coveragePercent}%</span></div>
              </div>

              {report.errors.length > 0 && (
                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-red-600">Errors</h3>
                  {report.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm rounded border border-red-500/20 bg-red-500/5 p-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-mono text-xs text-red-400">[{e.type}]</span>
                        <span className="ml-1">{e.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {report.warnings.length > 0 && (
                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-yellow-600">Warnings</h3>
                  {report.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm rounded border border-yellow-500/20 bg-yellow-500/5 p-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default PSControlPanelPage;
