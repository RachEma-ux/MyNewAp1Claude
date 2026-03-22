/**
 * WS Control Panel — Governance and operational control surface
 *
 * Supports lifecycle oversight, status transitions, publication/activation controls,
 * shell visibility management, configuration, and health monitoring.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { PageShell } from "@/components/app";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  ArrowRight,
  CheckCircle,
  XCircle,
  Globe,
  Zap,
  Archive,
  Trash2,
  RotateCcw,
  Eye,
  FileEdit,
  Clock,
  Search,
} from "lucide-react";

const TRANSITION_ACTIONS: Record<string, { label: string; icon: React.ReactNode; variant: "default" | "destructive" | "secondary" | "outline" }[]> = {
  draft: [
    { label: "Submit for Review", icon: <ArrowRight className="h-3 w-3" />, variant: "default" },
    { label: "Delete", icon: <Trash2 className="h-3 w-3" />, variant: "destructive" },
  ],
  ready_for_review: [
    { label: "Begin Review", icon: <Eye className="h-3 w-3" />, variant: "default" },
    { label: "Return to Draft", icon: <RotateCcw className="h-3 w-3" />, variant: "outline" },
  ],
  under_review: [
    { label: "Approve", icon: <CheckCircle className="h-3 w-3" />, variant: "default" },
    { label: "Reject", icon: <XCircle className="h-3 w-3" />, variant: "destructive" },
  ],
  approved: [
    { label: "Publish", icon: <Globe className="h-3 w-3" />, variant: "default" },
    { label: "Archive", icon: <Archive className="h-3 w-3" />, variant: "secondary" },
  ],
  published: [
    { label: "Activate", icon: <Zap className="h-3 w-3" />, variant: "default" },
    { label: "Archive", icon: <Archive className="h-3 w-3" />, variant: "secondary" },
  ],
  active: [
    { label: "Archive", icon: <Archive className="h-3 w-3" />, variant: "secondary" },
  ],
  rejected: [
    { label: "Return to Draft", icon: <RotateCcw className="h-3 w-3" />, variant: "outline" },
    { label: "Archive", icon: <Archive className="h-3 w-3" />, variant: "secondary" },
  ],
  archived: [
    { label: "Return to Draft", icon: <RotateCcw className="h-3 w-3" />, variant: "outline" },
    { label: "Delete", icon: <Trash2 className="h-3 w-3" />, variant: "destructive" },
  ],
};

export default function WSControlPanelPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: allWorkspaces, isLoading } = trpc.wsCatalog.listAll.useQuery();

  const submitForReview = trpc.workspaces.submitForReview.useMutation({ onSuccess: () => { utils.wsCatalog.listAll.invalidate(); toast.success("Submitted for review"); } });
  const beginReview = trpc.workspaces.review.useMutation({ onSuccess: () => { utils.wsCatalog.listAll.invalidate(); toast.success("Review started"); } });
  const approve = trpc.workspaces.approve.useMutation({ onSuccess: () => { utils.wsCatalog.listAll.invalidate(); toast.success("Workspace approved"); } });
  const publish = trpc.workspaces.publish.useMutation({ onSuccess: () => { utils.wsCatalog.listAll.invalidate(); toast.success("Workspace published"); } });
  const activate = trpc.workspaces.activate.useMutation({ onSuccess: () => { utils.wsCatalog.listAll.invalidate(); toast.success("Workspace activated"); } });
  const reject = trpc.workspaces.reject.useMutation({ onSuccess: () => { utils.wsCatalog.listAll.invalidate(); toast.success("Workspace rejected"); setRejectingId(null); } });
  const archive = trpc.workspaces.archive.useMutation({ onSuccess: () => { utils.wsCatalog.listAll.invalidate(); toast.success("Workspace archived"); } });
  const deleteWs = trpc.workspaces.delete.useMutation({ onSuccess: () => { utils.wsCatalog.listAll.invalidate(); toast.success("Workspace deleted"); } });
  const returnToDraft = trpc.workspaces.returnToDraft.useMutation({ onSuccess: () => { utils.wsCatalog.listAll.invalidate(); toast.success("Returned to draft"); } });

  const handleAction = (wsId: number, wsStatus: string, actionLabel: string) => {
    switch (actionLabel) {
      case "Submit for Review": submitForReview.mutate({ id: wsId }); break;
      case "Begin Review": beginReview.mutate({ id: wsId }); break;
      case "Approve": approve.mutate({ id: wsId }); break;
      case "Publish": publish.mutate({ id: wsId }); break;
      case "Activate": activate.mutate({ id: wsId }); break;
      case "Reject": setRejectingId(wsId); break;
      case "Archive": archive.mutate({ id: wsId }); break;
      case "Delete": deleteWs.mutate({ id: wsId }); break;
      case "Return to Draft": returnToDraft.mutate({ id: wsId }); break;
    }
  };

  const filtered = (allWorkspaces || []).filter((ws: any) =>
    ws.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageShell
      title="Workspace Control Panel"
      subtitle="Governance and lifecycle management"
    >
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search workspaces..."
          className="pl-9"
        />
      </div>

      {/* Reject dialog */}
      {rejectingId !== null && (
        <Card className="mb-4 border-destructive/30">
          <CardContent className="py-4">
            <p className="text-sm font-medium mb-2">Rejection Reason</p>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this workspace is being rejected..."
              rows={2}
            />
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  if (rejectReason.trim()) {
                    reject.mutate({ id: rejectingId, reason: rejectReason });
                    setRejectReason("");
                  } else {
                    toast.error("Rejection reason is required");
                  }
                }}
              >
                Confirm Rejection
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setRejectingId(null); setRejectReason(""); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ws: any) => {
            const actions = TRANSITION_ACTIONS[ws.status] || [];
            return (
              <Card key={ws.id}>
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-sm truncate">{ws.name}</h3>
                      <Badge variant="outline" className="text-xs">{ws.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {ws.description || "No description"}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {actions.map((action, i) => (
                      <Button
                        key={i}
                        size="sm"
                        variant={action.variant}
                        className="text-xs"
                        onClick={(e) => { e.stopPropagation(); handleAction(ws.id, ws.status, action.label); }}
                      >
                        {action.icon}
                        <span className="ml-1 hidden sm:inline">{action.label}</span>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
