/**
 * PMT Discussions — Forum-style discussion list
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, MessageSquare, Pin, Lock } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

export function PMTDiscussionsPage({ workspaceId }: { workspaceId: number }) {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");

  const utils = trpc.useUtils();
  const { data: projects } = trpc.modules.pmt.projects.list.useQuery({ workspaceId });
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: discussions, isLoading } = trpc.modules.pmt.discussions.list.useQuery(
    { workspaceId, projectId: projectId || undefined },
    { enabled: true }
  );

  const createMut = trpc.modules.pmt.discussions.create.useMutation({
    onSuccess: () => {
      utils.modules.pmt.discussions.list.invalidate();
      setCreateOpen(false);
      setTitle("");
      toast.success("Discussion created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const sorted = [...(discussions || [])].sort((a: any, b: any) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="h-6 w-6" />
          Discussions
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
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Discussion
          </Button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No discussions yet. Start a new one.
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="w-24">Posts</TableHead>
                <TableHead className="w-40">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((d: any) => (
                <TableRow key={d.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/workspaces/${workspaceId}/projects/discussions/${d.id}`}
                        className="font-medium hover:underline"
                      >
                        {d.title}
                      </Link>
                      {d.pinned && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          <Pin className="h-3 w-3 mr-0.5" />
                          Pinned
                        </Badge>
                      )}
                      {d.locked && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          <Lock className="h-3 w-3 mr-0.5" />
                          Locked
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {d.postCount ?? 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Discussion Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Discussion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Discussion topic"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                createMut.mutate({
                  workspaceId,
                  projectId: projectId || undefined,
                  title,
                });
              }}
              disabled={!title.trim() || createMut.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
