/**
 * Knowledge Decisions — Decision log with CRUD
 */

import { useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Scale } from "lucide-react";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  proposed: "bg-blue-500/10 text-blue-500",
  under_review: "bg-yellow-500/10 text-yellow-500",
  decided: "bg-green-500/10 text-green-500",
  superseded: "bg-gray-500/10 text-gray-500",
};

export function KnowledgeDecisionsPage({ workspaceId }: { workspaceId: number }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const utils = trpc.useUtils();
  const { data: decisions, isLoading } = trpc.modules.knowledge.decisions.list.useQuery({ workspaceId });

  const createMut = trpc.modules.knowledge.decisions.create.useMutation({
    onSuccess: () => {
      utils.modules.knowledge.decisions.list.invalidate();
      setCreateOpen(false);
      setTitle("");
      setDescription("");
      toast.success("Decision recorded");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.modules.knowledge.decisions.update.useMutation({
    onSuccess: () => {
      utils.modules.knowledge.decisions.list.invalidate();
      toast.success("Decision updated");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Scale className="h-6 w-6" />
          Decisions
        </h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Decision
        </Button>
      </div>

      {decisions && decisions.length > 0 ? (
        <div className="space-y-2">
          {decisions.map((d) => (
            <Card key={d.id}>
              <CardContent className="py-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{d.title}</p>
                    {d.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {d.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${statusColors[d.status] || ""}`}
                      >
                        {d.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(d.createdAt).toLocaleDateString()}
                      </span>
                      {d.decidedAt && (
                        <span className="text-[10px] text-muted-foreground">
                          Decided: {new Date(d.decidedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <Select
                    value={d.status}
                    onValueChange={(v) =>
                      updateMut.mutate({ id: d.id, workspaceId, status: v })
                    }
                  >
                    <SelectTrigger className="w-28 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="proposed">Proposed</SelectItem>
                      <SelectItem value="under_review">Under Review</SelectItem>
                      <SelectItem value="decided">Decided</SelectItem>
                      <SelectItem value="superseded">Superseded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Scale className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No decisions recorded yet.</p>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Decision</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Decision title"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Context, rationale, and outcome"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() =>
                createMut.mutate({
                  workspaceId,
                  title,
                  description: description || undefined,
                })
              }
              disabled={!title.trim() || createMut.isPending}
            >
              Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
