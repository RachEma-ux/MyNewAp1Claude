import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, Shield } from "lucide-react";
import { toast } from "sonner";

export default function CodeStudioPoliciesPage() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const policiesQuery = trpc.codeStudio.policies.list.useQuery();
  const policies = policiesQuery.data ?? [];

  const createMutation = trpc.codeStudio.policies.create.useMutation({
    onSuccess: () => { toast.success("Policy created"); setOpen(false); setName(""); policiesQuery.refetch(); },
    onError: () => toast.error("Failed to create policy"),
  });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4 text-purple-500" /> Security Policies
          {policies.length > 0 && <Badge variant="secondary" className="text-[9px] px-1.5">{policies.length}</Badge>}
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="text-xs"><Plus className="h-3 w-3 mr-1" /> New Policy</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle className="text-sm">Create Policy Profile</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input className="h-8 text-xs" placeholder="Policy name..." value={name} onChange={(e) => setName(e.target.value)} />
              <Button size="sm" className="w-full text-xs" disabled={!name.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate({ name: name.trim() })}>
                {createMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {policiesQuery.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>}
      {!policiesQuery.isLoading && policies.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-8">No policies defined. A default policy is applied automatically.</p>
      )}
      <div className="space-y-2">
        {policies.map((p: any) => (
          <Card key={p.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {p.isDefault ? "Default profile" : `Profile #${p.id}`}
                    {p.createdAt && ` · ${new Date(p.createdAt).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {p.isDefault && <Badge variant="secondary" className="text-[9px]">Default</Badge>}
                  <Badge variant="outline" className="text-[9px]">
                    {p.maxConcurrentJobs || "∞"} concurrent
                  </Badge>
                </div>
              </div>
              {p.allowedTools && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {(Array.isArray(p.allowedTools) ? p.allowedTools : []).map((t: string) => (
                    <Badge key={t} variant="outline" className="text-[8px] px-1 font-mono">{t}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
