import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, Workflow, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  draft: "text-zinc-500 border-zinc-500/30",
  queued: "text-blue-500 border-blue-500/30",
  preparing_workspace: "text-cyan-500 border-cyan-500/30",
  starting_session: "text-cyan-500 border-cyan-500/30",
  planning: "text-indigo-500 border-indigo-500/30",
  awaiting_approval: "text-amber-500 border-amber-500/30",
  building: "text-violet-500 border-violet-500/30",
  reviewing: "text-orange-500 border-orange-500/30",
  testing: "text-teal-500 border-teal-500/30",
  governance_check: "text-purple-500 border-purple-500/30",
  completed: "text-green-500 border-green-500/30",
  failed: "text-red-500 border-red-500/30",
  cancelled: "text-zinc-400 border-zinc-400/30",
  archived: "text-zinc-300 border-zinc-300/30",
};

export default function CodeStudioJobsPage() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");

  const jobsQuery = trpc.codeStudio.jobs.list.useQuery({});
  const jobs = jobsQuery.data ?? [];

  const createMutation = trpc.codeStudio.jobs.create.useMutation({
    onSuccess: (data: any) => {
      toast.success("Job created");
      setOpen(false);
      setTitle("");
      setObjective("");
      jobsQuery.refetch();
      if (data?.id) navigate(`/code-studio/jobs/${data.id}`);
    },
    onError: () => toast.error("Failed to create job"),
  });

  const deleteMutation = trpc.codeStudio.jobs.delete.useMutation({
    onSuccess: () => { toast.success("Job deleted"); jobsQuery.refetch(); },
    onError: () => toast.error("Failed to delete job"),
  });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Workflow className="h-4 w-4 text-violet-500" /> Coding Jobs
          {jobs.length > 0 && <Badge variant="secondary" className="text-[9px] px-1.5">{jobs.length}</Badge>}
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="text-xs"><Plus className="h-3 w-3 mr-1" /> New Job</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle className="text-sm">Create Coding Job</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input className="h-8 text-xs" placeholder="Job title..." value={title} onChange={(e) => setTitle(e.target.value)} />
              <Textarea className="text-xs h-20 resize-none" placeholder="Coding objective..." value={objective} onChange={(e) => setObjective(e.target.value)} />
              <Button size="sm" className="w-full text-xs" disabled={!title.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate({ title: title.trim(), objective: objective.trim() || undefined })}>
                {createMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {jobsQuery.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>}
      {!jobsQuery.isLoading && jobs.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-8">No coding jobs yet. Create one to get started.</p>
      )}
      <div className="space-y-2">
        {jobs.map((j: any) => (
          <Card key={j.id} className="hover:border-violet-500/30 transition-colors cursor-pointer"
            onClick={() => navigate(`/code-studio/jobs/${j.id}`)}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{j.title}</p>
                  {j.objective && <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{j.objective}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <Badge variant="outline" className={`text-[9px] px-1 py-0 ${STATUS_COLORS[j.status] || ""}`}>
                    {j.status?.replace(/_/g, " ")}
                  </Badge>
                  <button title="Delete job" className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    onClick={(e) => { e.stopPropagation(); if (confirm(`Delete job "${j.title}"?`)) deleteMutation.mutate({ id: j.id }); }}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-[9px] text-muted-foreground">
                <span>#{j.id}</span>
                {j.priority && <span className="uppercase">{j.priority}</span>}
                {j.createdAt && <span>{new Date(j.createdAt).toLocaleDateString()}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
