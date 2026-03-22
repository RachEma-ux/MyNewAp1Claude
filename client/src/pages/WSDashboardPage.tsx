/**
 * WS Dashboard — High-level workspace system overview
 *
 * Shows active workspaces, recently published, alerts/trends,
 * lifecycle changes, and operational summary.
 */

import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { PageShell } from "@/components/app";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FolderOpen,
  Zap,
  Globe,
  FileEdit,
  Clock,
  Plus,
  ArrowRight,
  BarChart3,
  Activity,
} from "lucide-react";

export default function WSDashboardPage() {
  const [, navigate] = useLocation();
  const { data: allWorkspaces } = trpc.wsCatalog.listAll.useQuery();
  const { data: published } = trpc.wsCatalog.listPublished.useQuery();

  const all = allWorkspaces || [];
  const activeCount = all.filter((w: any) => w.status === "active").length;
  const publishedCount = all.filter((w: any) => w.status === "published").length;
  const draftCount = all.filter((w: any) => w.status === "draft").length;
  const reviewCount = all.filter((w: any) => w.status === "under_review" || w.status === "ready_for_review").length;
  const recentActive = all.filter((w: any) => w.status === "active").slice(0, 5);
  const recentPublished = all.filter((w: any) => w.status === "published").slice(0, 5);

  return (
    <PageShell
      title="Workspace Dashboard"
      subtitle="Overview of the workspace system"
      action={
        <Button onClick={() => navigate("/ws/wizard")}>
          <Plus className="h-4 w-4 mr-1" /> New Workspace
        </Button>
      }
    >
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="cursor-pointer hover:border-primary/30" onClick={() => navigate("/ws/list")}>
          <CardContent className="py-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Active</span>
            </div>
            <p className="text-2xl font-bold">{activeCount}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/30" onClick={() => navigate("/ws/catalog")}>
          <CardContent className="py-4">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="h-4 w-4 text-cyan-500" />
              <span className="text-sm text-muted-foreground">Published</span>
            </div>
            <p className="text-2xl font-bold">{publishedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-2 mb-1">
              <FileEdit className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">Drafts</span>
            </div>
            <p className="text-2xl font-bold">{draftCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">In Review</span>
            </div>
            <p className="text-2xl font-bold">{reviewCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Active workspaces */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-green-500" /> Active Workspaces
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActive.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active workspaces</p>
            ) : (
              <div className="space-y-2">
                {recentActive.map((ws: any) => (
                  <div
                    key={ws.id}
                    className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                    onClick={() => navigate(`/w/${ws.id}/overview`)}
                  >
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm flex-1 truncate">{ws.name}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recently published */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4 text-cyan-500" /> Recently Published
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentPublished.length === 0 ? (
              <p className="text-sm text-muted-foreground">No published workspaces</p>
            ) : (
              <div className="space-y-2">
                {recentPublished.map((ws: any) => (
                  <div
                    key={ws.id}
                    className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                    onClick={() => navigate(`/w/${ws.id}/overview`)}
                  >
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm flex-1 truncate">{ws.name}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick navigation */}
      <div className="flex gap-3 mt-6">
        <Button variant="outline" onClick={() => navigate("/ws/list")}>
          <BarChart3 className="h-4 w-4 mr-1" /> Full Inventory
        </Button>
        <Button variant="outline" onClick={() => navigate("/ws/catalog")}>
          <Globe className="h-4 w-4 mr-1" /> Catalog
        </Button>
        <Button variant="outline" onClick={() => navigate("/ws/control-panel")}>
          <Activity className="h-4 w-4 mr-1" /> Control Panel
        </Button>
      </div>
    </PageShell>
  );
}
