/**
 * PMT Git References — Link PRs, commits, branches to work items
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, GitBranch, Plus, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";

const stateColors: Record<string, string> = {
  open: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  merged: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  closed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export function PMTGitReferencesPage({ workspaceId }: { workspaceId: number }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    workItemId: "",
    provider: "github",
    refType: "pr",
    refId: "",
    refUrl: "",
    refTitle: "",
    refState: "open",
  });

  const utils = trpc.useUtils();
  const { data: refs, isLoading } = trpc.modules.pmt.git.list.useQuery({ workspaceId });
  const { data: projects } = trpc.modules.pmt.projects.list.useQuery({ workspaceId });

  const createMut = trpc.modules.pmt.git.create.useMutation({
    onSuccess: () => {
      utils.modules.pmt.git.list.invalidate();
      setDialogOpen(false);
      toast.success("Git reference linked");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.modules.pmt.git.delete.useMutation({
    onSuccess: () => {
      utils.modules.pmt.git.list.invalidate();
      toast.success("Git reference removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!form.workItemId || !form.refId || !form.refUrl) {
      toast.error("Fill required fields");
      return;
    }
    createMut.mutate({
      workspaceId,
      workItemId: parseInt(form.workItemId),
      provider: form.provider,
      refType: form.refType,
      refId: form.refId,
      refUrl: form.refUrl,
      refTitle: form.refTitle || undefined,
      refState: form.refState || undefined,
    });
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <GitBranch className="h-6 w-6" />
          Git References
        </h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Link Reference
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !refs || (refs as any[]).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No git references linked yet.
        </div>
      ) : (
        <div className="space-y-2">
          {(refs as any[]).map((r: any) => (
            <Card key={r.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {r.provider}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {r.refType}
                  </Badge>
                  <span className="text-sm font-medium truncate">
                    {r.refTitle || r.refId}
                  </span>
                  {r.refState && (
                    <Badge className={`text-[10px] ${stateColors[r.refState] || ""}`}>
                      {r.refState}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    Task #{r.workItemId}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(r.refUrl, "_blank")}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => {
                      if (confirm("Remove this reference?"))
                        deleteMut.mutate({ id: r.id, workspaceId });
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Git Reference</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Work Item ID</Label>
              <Input
                type="number"
                value={form.workItemId}
                onChange={(e) => setForm({ ...form, workItemId: e.target.value })}
                placeholder="Task ID"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="github">GitHub</SelectItem>
                    <SelectItem value="gitlab">GitLab</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.refType} onValueChange={(v) => setForm({ ...form, refType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pr">Pull Request</SelectItem>
                    <SelectItem value="commit">Commit</SelectItem>
                    <SelectItem value="branch">Branch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reference ID</Label>
              <Input
                value={form.refId}
                onChange={(e) => setForm({ ...form, refId: e.target.value })}
                placeholder="PR #123, commit SHA, branch name"
              />
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input
                value={form.refUrl}
                onChange={(e) => setForm({ ...form, refUrl: e.target.value })}
                placeholder="https://github.com/..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Title (optional)</Label>
                <Input
                  value={form.refTitle}
                  onChange={(e) => setForm({ ...form, refTitle: e.target.value })}
                  placeholder="Fix login bug"
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Select value={form.refState} onValueChange={(v) => setForm({ ...form, refState: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="merged">Merged</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMut.isPending}>
              Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
