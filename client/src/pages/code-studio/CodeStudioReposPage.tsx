import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, GitBranch } from "lucide-react";
import { toast } from "sonner";

export default function CodeStudioReposPage() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const reposQuery = trpc.codeStudio.repos.list.useQuery({});
  const repos = reposQuery.data ?? [];

  const createMutation = trpc.codeStudio.repos.create.useMutation({
    onSuccess: () => { toast.success("Repository registered"); setOpen(false); setName(""); setUrl(""); reposQuery.refetch(); },
    onError: () => toast.error("Failed to register repository"),
  });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-green-500" /> Repositories
          {repos.length > 0 && <Badge variant="secondary" className="text-[9px] px-1.5">{repos.length}</Badge>}
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="text-xs"><Plus className="h-3 w-3 mr-1" /> Register</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle className="text-sm">Register Repository</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input className="h-8 text-xs" placeholder="Repository name..." value={name} onChange={(e) => setName(e.target.value)} />
              <Input className="h-8 text-xs" placeholder="Repository URL..." value={url} onChange={(e) => setUrl(e.target.value)} />
              <Button size="sm" className="w-full text-xs" disabled={!name.trim() || !url.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate({ name: name.trim(), url: url.trim() })}>
                {createMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Register
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {reposQuery.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>}
      {!reposQuery.isLoading && repos.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-8">No repositories registered. Add one to get started.</p>
      )}
      <div className="space-y-2">
        {repos.map((r: any) => (
          <Card key={r.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{r.url}</p>
                </div>
                <Badge variant="outline" className="text-[9px]">{r.defaultBranch || "main"}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
