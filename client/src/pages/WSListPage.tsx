/**
 * WS List — Management inventory of all workspaces across lifecycle
 *
 * Shows all workspaces with lifecycle status, purpose, owner, next action.
 * For managers and admins — not participant-facing.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { PageShell } from "@/components/app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  FolderOpen,
  ArrowRight,
  Clock,
  CheckCircle,
  XCircle,
  Archive,
  Globe,
  Zap,
  FileEdit,
  Eye,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: "Draft", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20", icon: <FileEdit className="h-3 w-3" /> },
  ready_for_review: { label: "Ready for Review", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: <Eye className="h-3 w-3" /> },
  under_review: { label: "Under Review", color: "bg-purple-500/10 text-purple-600 border-purple-500/20", icon: <Clock className="h-3 w-3" /> },
  approved: { label: "Approved", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: <CheckCircle className="h-3 w-3" /> },
  published: { label: "Published", color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20", icon: <Globe className="h-3 w-3" /> },
  active: { label: "Active", color: "bg-green-500/10 text-green-600 border-green-500/20", icon: <Zap className="h-3 w-3" /> },
  rejected: { label: "Rejected", color: "bg-red-500/10 text-red-600 border-red-500/20", icon: <XCircle className="h-3 w-3" /> },
  archived: { label: "Archived", color: "bg-gray-500/10 text-gray-600 border-gray-500/20", icon: <Archive className="h-3 w-3" /> },
  deleted: { label: "Deleted", color: "bg-gray-800/10 text-gray-400 border-gray-800/20", icon: <XCircle className="h-3 w-3" /> },
};

export default function WSListPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: allWorkspaces, isLoading } = trpc.wsCatalog.listAll.useQuery(
    statusFilter !== "all" ? { status: statusFilter as any } : undefined
  );

  const filtered = (allWorkspaces || []).filter((ws: any) =>
    ws.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageShell
      title="Workspace List"
      subtitle="Management inventory — all workspaces across lifecycle"
      action={
        <Button onClick={() => navigate("/ws/wizard")}>
          <Plus className="h-4 w-4 mr-1" /> New Workspace
        </Button>
      }
    >
      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workspaces..."
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="ready_for_review">Ready for Review</SelectItem>
            <SelectItem value="under_review">Under Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Workspace cards */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading workspaces...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No workspaces found</p>
          <Button className="mt-4" onClick={() => navigate("/ws/wizard")}>
            <Plus className="h-4 w-4 mr-1" /> Create Workspace
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((ws: any) => {
            const sc = STATUS_CONFIG[ws.status] || STATUS_CONFIG.draft;
            return (
              <Card key={ws.id} className="hover:border-primary/30 transition-colors cursor-pointer" onClick={() => navigate(`/w/${ws.id}/overview`)}>
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium truncate">{ws.name}</h3>
                      <Badge variant="outline" className={`text-xs ${sc.color}`}>
                        {sc.icon}
                        <span className="ml-1">{sc.label}</span>
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {ws.description || "No description"}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>Type: {ws.type || "generic"}</span>
                      {(ws as any).purposeType && <span>Purpose: {(ws as any).purposeType}</span>}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
