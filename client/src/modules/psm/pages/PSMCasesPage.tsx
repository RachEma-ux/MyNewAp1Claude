import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, FolderKanban, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function PSMCasesPage() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  const casesQuery = trpc.psm.cases.list.useQuery({});
  const cases = casesQuery.data ?? [];

  const createMutation = trpc.psm.cases.create.useMutation({
    onSuccess: (data: any) => {
      toast.success("Case created");
      setOpen(false);
      setTitle("");
      setDesc("");
      casesQuery.refetch();
      if (data?.id) navigate(`/psm/cases/${data.id}`);
    },
    onError: () => toast.error("Failed to create case"),
  });

  const deleteMutation = trpc.psm.cases.delete.useMutation({
    onSuccess: () => { toast.success("Case deleted"); casesQuery.refetch(); },
    onError: () => toast.error("Failed to delete case"),
  });

  const statusColor = (s: string) => {
    switch (s) {
      case "active": return "text-blue-500 border-blue-500/30";
      case "completed": return "text-green-500 border-green-500/30";
      case "paused": return "text-amber-500 border-amber-500/30";
      case "abandoned": return "text-red-500 border-red-500/30";
      default: return "";
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-teal-500" /> Cases
          {cases.length > 0 && (
            <Badge variant="secondary" className="text-[9px] px-1.5">{cases.length}</Badge>
          )}
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="text-xs">
              <Plus className="h-3 w-3 mr-1" /> New Case
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm">Create Case</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                className="h-8 text-xs"
                placeholder="Case title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Textarea
                className="text-xs h-20 resize-none"
                placeholder="Describe the problem..."
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
              <Button
                size="sm"
                className="w-full text-xs"
                disabled={!title.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate({ title: title.trim(), description: desc.trim() || undefined })}
              >
                {createMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="h-[calc(100vh-12rem)]">
        {casesQuery.isLoading && (
          <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>
        )}
        {!casesQuery.isLoading && cases.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">No cases yet. Create one to get started.</p>
        )}
        <div className="space-y-2 pr-2">
          {cases.map((c: any) => (
            <Card
              key={c.id}
              className="hover:border-teal-500/30 transition-colors cursor-pointer"
              onClick={() => navigate(`/psm/cases/${c.id}`)}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{c.title}</p>
                    {c.description && (
                      <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{c.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Badge variant="outline" className={`text-[9px] px-1 py-0 capitalize ${statusColor(c.status)}`}>
                      {c.status}
                    </Badge>
                    <button
                      title="Delete case"
                      className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete case "${c.title}"?`)) {
                          deleteMutation.mutate({ id: c.id });
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-[9px] text-muted-foreground">
                  <span>#{c.id}</span>
                  {c.createdAt && <span>{new Date(c.createdAt).toLocaleDateString()}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
