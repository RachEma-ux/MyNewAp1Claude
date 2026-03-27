/**
 * PS Ideation — List Page
 *
 * Shows all ideation records for the current workspace, with create dialog.
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
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Lightbulb,
  Plus,
  Loader2,
  ArrowLeft,
  Search,
  FolderOpen,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-500 border-gray-500/30",
  in_exploration: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  screening: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  concept_selected: "bg-purple-500/10 text-purple-600 border-purple-500/30",
  ready_for_wizard: "bg-green-500/10 text-green-600 border-green-500/30",
  deferred: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  rejected: "bg-red-500/10 text-red-600 border-red-500/30",
  converted: "bg-indigo-500/10 text-indigo-600 border-indigo-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_exploration: "In Exploration",
  screening: "Screening",
  concept_selected: "Concept Selected",
  ready_for_wizard: "Ready for Wizard",
  deferred: "Deferred",
  rejected: "Rejected",
  converted: "Converted",
};

// Default workspace for top-level PS pages
const DEFAULT_WORKSPACE_ID = 1;

export function PSIdeationPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const { data: ideations, isLoading } = trpc.ps.ideation.list.useQuery(
    { workspaceId: DEFAULT_WORKSPACE_ID },
  );

  const createMut = trpc.ps.ideation.create.useMutation({
    onSuccess: (data) => {
      toast.success("Ideation created");
      setDialogOpen(false);
      setNewTitle("");
      navigate(`/ps/ideation/${data.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    createMut.mutate({ workspaceId: DEFAULT_WORKSPACE_ID, title: newTitle.trim() });
  };

  const filtered = (ideations || []).filter((i: any) => {
    if (statusFilter && i.lifecycleStatus !== statusFilter) return false;
    if (search && !i.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const statuses = ["", "draft", "in_exploration", "screening", "concept_selected", "ready_for_wizard", "deferred", "rejected", "converted"];

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/ps/catalog">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lightbulb className="w-6 h-6 text-yellow-500" />
            PS Ideation
          </h1>
        </div>
        <Button onClick={() => setDialogOpen(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          New Ideation
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ideations..."
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {statuses.map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              className="text-xs"
              onClick={() => setStatusFilter(s)}
            >
              {s ? STATUS_LABELS[s] || s : "All"}
            </Button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FolderOpen className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm">{ideations?.length ? "No matching ideations." : "No ideations yet. Create your first one."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((ideation: any) => (
            <Link key={ideation.id} href={`/ps/ideation/${ideation.id}`}>
              <Card className="cursor-pointer hover:border-primary/50 transition-colors">
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{ideation.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Step: {ideation.currentStepKey || "context"} | Created: {new Date(ideation.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <Badge variant="outline" className={STATUS_COLORS[ideation.lifecycleStatus] || ""}>
                    {STATUS_LABELS[ideation.lifecycleStatus] || ideation.lifecycleStatus}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Ideation</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="ideation-title">Title</Label>
              <Input
                id="ideation-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Enter ideation title..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTitle.trim()) handleCreate();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMut.isPending || !newTitle.trim()}>
              {createMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PSIdeationPage;
