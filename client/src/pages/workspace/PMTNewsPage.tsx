/**
 * PMT News — Blog-style news/announcements list
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Newspaper, ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function PMTNewsPage() {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");

  const utils = trpc.useUtils();
  const { data: projects } = trpc.modules.pmt.projects.list.useQuery();
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: news, isLoading } = trpc.modules.pmt.news.list.useQuery(
    { projectId: projectId || undefined },
    { enabled: true }
  );

  const createMut = trpc.modules.pmt.news.create.useMutation({
    onSuccess: () => {
      utils.modules.pmt.news.list.invalidate();
      closeDialog();
      toast.success("News published");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMut = trpc.modules.pmt.news.update.useMutation({
    onSuccess: () => {
      utils.modules.pmt.news.list.invalidate();
      closeDialog();
      toast.success("News updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = trpc.modules.pmt.news.delete.useMutation({
    onSuccess: () => {
      utils.modules.pmt.news.list.invalidate();
      toast.success("News deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  function closeDialog() {
    setCreateOpen(false);
    setEditItem(null);
    setTitle("");
    setSummary("");
    setContent("");
  }

  function openEdit(item: any) {
    setEditItem(item);
    setTitle(item.title);
    setSummary(item.summary || "");
    setContent(item.content || "");
    setCreateOpen(true);
  }

  const sorted = [...(news || [])].sort(
    (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Newspaper className="h-6 w-6" />
          News
        </h1>
        <div className="flex items-center gap-2">
          {projects && projects.length > 0 && (
            <Select
              value={String(projectId || "")}
              onValueChange={(v) => setSelectedProject(parseInt(v))}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" onClick={() => { setEditItem(null); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />
            Publish News
          </Button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No news articles yet. Publish one to share updates.
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((item: any) => (
            <Card key={item.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  >
                    <CardTitle className="text-lg">{item.title}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {new Date(item.createdAt).toLocaleDateString()}
                      {item.authorName && ` · ${item.authorName}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(item)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMut.mutate({ id: item.id })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    >
                      {expandedId === item.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {item.summary && (
                  <p className="text-sm text-muted-foreground">{item.summary}</p>
                )}
                {expandedId === item.id && item.content && (
                  <div className="mt-3 pt-3 border-t text-sm whitespace-pre-wrap">
                    {item.content}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit News" : "Publish News"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Headline" />
            </div>
            <div className="space-y-2">
              <Label>Summary</Label>
              <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Brief summary" />
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Full article content" rows={5} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={() => {
                if (editItem) {
                  updateMut.mutate({
                    id: editItem.id,
                    title,
                    summary: summary || undefined,
                    content: content || undefined,
                  });
                } else {
                  createMut.mutate({
                    projectId: projectId || undefined,
                    title,
                    summary: summary || undefined,
                    content: content || undefined,
                  });
                }
              }}
              disabled={!title.trim() || (editItem ? updateMut.isPending : createMut.isPending)}
            >
              {editItem ? "Save" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
