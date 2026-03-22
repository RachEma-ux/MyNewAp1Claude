/**
 * Knowledge Documents — Document list with inline editor
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Plus, FileText, Trash2, Save, History } from "lucide-react";
import { toast } from "sonner";

export function KnowledgeDocsPage({ workspaceId }: { workspaceId: number }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editorDocId, setEditorDocId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [versionsDocId, setVersionsDocId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: docs, isLoading } = trpc.modules.knowledge.documents.list.useQuery({ workspaceId });

  const { data: editDoc } = trpc.modules.knowledge.documents.get.useQuery(
    { id: editorDocId!, workspaceId },
    { enabled: !!editorDocId }
  );

  // Sync editor state when document loads
  useEffect(() => {
    if (editDoc) {
      setEditTitle(editDoc.title);
      setEditContent(editDoc.content || "");
    }
  }, [editDoc]);

  const { data: versions } = trpc.modules.knowledge.documents.versions.useQuery(
    { documentId: versionsDocId!, workspaceId },
    { enabled: !!versionsDocId }
  );

  const createMut = trpc.modules.knowledge.documents.create.useMutation({
    onSuccess: () => {
      utils.modules.knowledge.documents.list.invalidate();
      setCreateOpen(false);
      setNewTitle("");
      setNewContent("");
      toast.success("Document created");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.modules.knowledge.documents.update.useMutation({
    onSuccess: () => {
      utils.modules.knowledge.documents.list.invalidate();
      utils.modules.knowledge.documents.get.invalidate();
      toast.success("Document saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.modules.knowledge.documents.delete.useMutation({
    onSuccess: () => {
      utils.modules.knowledge.documents.list.invalidate();
      setEditorDocId(null);
      toast.success("Document deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Documents
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {docs?.length || 0} documents
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Document
        </Button>
      </div>

      {docs && docs.length > 0 ? (
        <div className="space-y-2">
          {docs.map((doc) => (
            <Card
              key={doc.id}
              className="cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => setEditorDocId(doc.id)}
            >
              <CardContent className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{doc.title}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>v{doc.version}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {doc.status || "draft"}
                    </Badge>
                    <span>{new Date(doc.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      setVersionsDocId(doc.id);
                    }}
                  >
                    <History className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete this document?")) {
                        deleteMut.mutate({ id: doc.id, workspaceId });
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No documents yet.</p>
        </div>
      )}

      {/* Document Editor Sheet */}
      <Sheet open={!!editorDocId} onOpenChange={(open) => !open && setEditorDocId(null)}>
        <SheetContent side="right" className="w-[500px] sm:max-w-[500px]">
          <SheetHeader>
            <SheetTitle>Edit Document</SheetTitle>
          </SheetHeader>
          {editDoc && (
            <div className="mt-4 space-y-4 flex flex-col h-[calc(100vh-120px)]">
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="font-semibold"
              />
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 min-h-[300px] font-mono text-sm"
                placeholder="Document content (markdown supported)"
              />
              <Input
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                placeholder="Change note (optional)"
                className="text-sm"
              />
              <div className="flex justify-between">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm("Delete this document?")) {
                      deleteMut.mutate({ id: editDoc.id, workspaceId });
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    updateMut.mutate({
                      id: editDoc.id,
                      workspaceId,
                      title: editTitle,
                      content: editContent,
                      changeNote: changeNote || undefined,
                    })
                  }
                  disabled={updateMut.isPending}
                >
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Versions Dialog */}
      <Dialog open={!!versionsDocId} onOpenChange={(open) => !open && setVersionsDocId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {versions && versions.length > 0 ? (
              <div className="space-y-2">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between border rounded-md p-2"
                  >
                    <div>
                      <span className="text-sm font-medium">v{v.version}</span>
                      <p className="text-xs text-muted-foreground">
                        {v.changeNote || "No note"}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(v.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No versions</p>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Document title"
              />
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Document content"
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() =>
                createMut.mutate({
                  workspaceId,
                  title: newTitle,
                  content: newContent || undefined,
                })
              }
              disabled={!newTitle.trim() || createMut.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
