/**
 * PMT Webhooks — Configure outgoing webhook endpoints for PM events
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Webhook, Plus, Pencil, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

const EVENTS = [
  "task.created",
  "task.updated",
  "task.deleted",
  "project.created",
  "project.updated",
  "sprint.started",
  "sprint.closed",
  "comment.created",
];

export function PMTWebhooksPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", url: "", secret: "", events: [] as string[] });

  const utils = trpc.useUtils();
  const { data: webhooks, isLoading } = trpc.modules.pmt.webhooks.list.useQuery();

  const createMut = trpc.modules.pmt.webhooks.create.useMutation({
    onSuccess: () => { utils.modules.pmt.webhooks.list.invalidate(); setDialogOpen(false); toast.success("Webhook created"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.modules.pmt.webhooks.update.useMutation({
    onSuccess: () => { utils.modules.pmt.webhooks.list.invalidate(); setDialogOpen(false); toast.success("Webhook updated"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.modules.pmt.webhooks.delete.useMutation({
    onSuccess: () => { utils.modules.pmt.webhooks.list.invalidate(); toast.success("Webhook deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const testMut = trpc.modules.pmt.webhooks.test.useMutation({
    onSuccess: () => toast.success("Test payload sent"),
    onError: (e) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", url: "", secret: "", events: [] });
    setDialogOpen(true);
  };

  const openEdit = (w: any) => {
    setEditingId(w.id);
    setForm({
      name: w.name,
      url: w.url,
      secret: w.secret || "",
      events: w.events || [],
    });
    setDialogOpen(true);
  };

  const toggleEvent = (ev: string) => {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(ev)
        ? prev.events.filter((e) => e !== ev)
        : [...prev.events, ev],
    }));
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.url.trim()) { toast.error("Name and URL required"); return; }
    const payload = {
      name: form.name,
      url: form.url,
      secret: form.secret || undefined,
      events: form.events,
    };
    if (editingId) {
      updateMut.mutate({ id: editingId, ...payload });
    } else {
      createMut.mutate(payload);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Webhook className="h-6 w-6" />
          Webhooks
        </h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          New Webhook
        </Button>
      </div>

      {!webhooks || (webhooks as any[]).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No webhooks configured.
        </div>
      ) : (
        <div className="space-y-3">
          {(webhooks as any[]).map((w: any) => (
            <Card key={w.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{w.name}</span>
                    <Badge variant={w.active ? "default" : "secondary"} className="text-[10px]">
                      {w.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{w.url}</div>
                  <div className="flex flex-wrap gap-1">
                    {(w.events || []).map((ev: string) => (
                      <Badge key={ev} variant="outline" className="text-[9px]">{ev}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => testMut.mutate({ id: w.id })} disabled={testMut.isPending}>
                    <Zap className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(w)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { if (confirm("Delete?")) deleteMut.mutate({ id: w.id }); }}>
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
            <DialogTitle>{editingId ? "Edit Webhook" : "Create Webhook"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Webhook name" />
            </div>
            <div className="space-y-2">
              <Label>Payload URL</Label>
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/webhook" />
            </div>
            <div className="space-y-2">
              <Label>Secret (optional)</Label>
              <Input value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder="Shared secret for verification" />
            </div>
            <div className="space-y-2">
              <Label>Events</Label>
              <div className="grid grid-cols-2 gap-2">
                {EVENTS.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.events.includes(ev)}
                      onChange={() => toggleEvent(ev)}
                      className="rounded"
                    />
                    {ev}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>
              {editingId ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
