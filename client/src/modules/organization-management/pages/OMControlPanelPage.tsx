/**
 * OM Control Panel — Quick actions and structure health
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Plus, GitBranch, AlertTriangle, CheckCircle, FileStack } from "lucide-react";

export function OMControlPanelPage({ workspaceId }: { workspaceId: number }) {
  const versions = trpc.organizationManagement.structureVersions.list.useQuery({ workspaceId });
  const orgUnits = trpc.organizationManagement.orgUnits.list.useQuery({ workspaceId });
  const positions = trpc.organizationManagement.positions.list.useQuery({ workspaceId });
  const settings = trpc.organizationManagement.settings.get.useQuery({ workspaceId });

  const activeVersion = versions.data?.find(v => v.status === "published");
  const draftVersions = versions.data?.filter(v => v.status === "draft") ?? [];
  const frozenUnits = orgUnits.data?.filter(u => u.status === "frozen").length ?? 0;
  const closedPositions = positions.data?.filter(p => p.status === "closed").length ?? 0;

  const healthChecks = [
    { label: "Active structure version", ok: !!activeVersion },
    { label: "No frozen org units", ok: frozenUnits === 0 },
    { label: "All positions operable", ok: closedPositions === 0 },
    { label: "Module features", ok: !!settings.data },
  ];

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-2xl font-bold">OM Control Panel</h1>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Quick Actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Link href={`/om/wizard?workspaceId=${workspaceId}`}>
              <Button className="w-full justify-start" variant="outline">
                <Plus className="w-4 h-4 mr-2" /> Launch OM Wizard
              </Button>
            </Link>
            <Link href="/om/templates">
              <Button className="w-full justify-start" variant="outline">
                <FileStack className="w-4 h-4 mr-2" /> Templates
              </Button>
            </Link>
            <Button className="w-full justify-start" variant="outline" disabled>
              <GitBranch className="w-4 h-4 mr-2" /> Create Structure Version
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Structure Health</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {healthChecks.map(h => (
              <div key={h.label} className="flex items-center gap-2 text-sm">
                {h.ok ? <CheckCircle className="w-4 h-4 text-green-500" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                <span>{h.label}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Structure Versions</CardTitle></CardHeader>
        <CardContent>
          {versions.data?.map(v => (
            <div key={v.id} className="flex items-center justify-between py-2 text-sm border-b last:border-0">
              <span>v{v.versionNumber} — {v.name}</span>
              <Badge variant={v.status === "published" ? "default" : "outline"}>{v.status}</Badge>
            </div>
          ))}
          {!versions.data?.length && <p className="text-sm text-muted-foreground">No versions yet</p>}
        </CardContent>
      </Card>
    </div>
  );
}

export default OMControlPanelPage;
