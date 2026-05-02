import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Star, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function OpenRouterRoutingPage() {
  const profiles = trpc.openRouter.routing.listProfiles.useQuery();
  const setDefault = trpc.openRouter.routing.setDefault.useMutation();
  const createMut = trpc.openRouter.routing.create.useMutation();
  const deleteMut = trpc.openRouter.routing.delete.useMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [allowFallbacks, setAllowFallbacks] = useState(true);

  const handleCreate = async () => {
    try {
      await createMut.mutateAsync({ name, description: desc, config: { allowFallbacks } });
      toast.success("Profile created");
      setDialogOpen(false);
      setName("");
      setDesc("");
      profiles.refetch();
    } catch (err) { toast.error((err as Error).message); }
  };

  const handleSetDefault = async (id: number) => {
    await setDefault.mutateAsync({ profileId: id });
    toast.success("Default updated");
    profiles.refetch();
  };

  const handleDelete = async (id: number) => {
    await deleteMut.mutateAsync({ id });
    toast.success("Deleted");
    profiles.refetch();
  };

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Routing Profiles</h3>
          <p className="text-sm text-muted-foreground">Control how OpenRouter selects providers for your requests</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> New Profile</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Routing Profile</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><label className="text-xs font-medium">Name</label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Custom Profile" /></div>
              <div><label className="text-xs font-medium">Description</label><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe the routing strategy" /></div>
              <div className="flex items-center gap-2"><Switch checked={allowFallbacks} onCheckedChange={setAllowFallbacks} /><span className="text-sm">Allow provider fallbacks</span></div>
              <Button onClick={handleCreate} disabled={!name || createMut.isPending} className="w-full">
                {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {(profiles.data ?? []).map((p) => (
          <Card key={p.id}>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{p.name}</span>
                  {p.isPreset && <Badge variant="outline" className="text-[9px]">Preset</Badge>}
                  {p.isDefault && <Badge className="text-[9px] bg-orange-500">Default</Badge>}
                </div>
                {p.description && <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>}
                {p.config && (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {(p.config as any).allowFallbacks !== false && <Badge variant="secondary" className="text-[8px] mr-1">fallbacks</Badge>}
                    {(p.config as any).dataCollection === "deny" && <Badge variant="secondary" className="text-[8px] mr-1">no-data</Badge>}
                    {(p.config as any).order && <Badge variant="secondary" className="text-[8px] mr-1">order: {(p.config as any).order.join(",")}</Badge>}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                {!p.isDefault && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSetDefault(p.id)} title="Set as default">
                    <Star className="w-3.5 h-3.5" />
                  </Button>
                )}
                {!p.isPreset && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(p.id)} title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {(!profiles.data || profiles.data.length === 0) && (
          <div className="text-center text-muted-foreground py-8 text-sm">No routing profiles. Connect OpenRouter first to seed presets.</div>
        )}
      </div>
    </div>
  );
}
