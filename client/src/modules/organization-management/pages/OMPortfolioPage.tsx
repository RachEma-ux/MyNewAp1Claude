/**
 * OM Portfolio — Overview of all organizational structures
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, Briefcase, GitBranch, Landmark, DollarSign } from "lucide-react";

export function OMPortfolioPage({ workspaceId }: { workspaceId: number }) {
  const entities = trpc.organizationManagement.legalEntities.list.useQuery({ workspaceId });
  const orgUnits = trpc.organizationManagement.orgUnits.list.useQuery({ workspaceId });
  const jobs = trpc.organizationManagement.jobs.list.useQuery({ workspaceId });
  const positions = trpc.organizationManagement.positions.list.useQuery({ workspaceId });
  const costCenters = trpc.organizationManagement.costCenters.list.useQuery({ workspaceId });
  const versions = trpc.organizationManagement.structureVersions.list.useQuery({ workspaceId });

  const stats = [
    { label: "Legal Entities", count: entities.data?.length ?? 0, icon: Landmark, color: "text-purple-500" },
    { label: "Org Units", count: orgUnits.data?.length ?? 0, icon: Building2, color: "text-blue-500" },
    { label: "Jobs", count: jobs.data?.length ?? 0, icon: Briefcase, color: "text-green-500" },
    { label: "Positions", count: positions.data?.length ?? 0, icon: Users, color: "text-orange-500" },
    { label: "Cost Centers", count: costCenters.data?.length ?? 0, icon: DollarSign, color: "text-yellow-500" },
    { label: "Structure Versions", count: versions.data?.length ?? 0, icon: GitBranch, color: "text-cyan-500" },
  ];

  const activeVersion = versions.data?.find(v => v.status === "published");
  const vacantPositions = positions.data?.filter(p => p.status === "vacant").length ?? 0;
  const frozenUnits = orgUnits.data?.filter(u => u.status === "frozen").length ?? 0;

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Organization Management</h1>
        {activeVersion && <Badge variant="outline" className="text-green-600">v{activeVersion.versionNumber} Published</Badge>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-2xl font-bold">{s.count}</span>
              </div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {(vacantPositions > 0 || frozenUnits > 0) && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Attention</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {vacantPositions > 0 && <p>{vacantPositions} vacant position{vacantPositions > 1 ? "s" : ""}</p>}
            {frozenUnits > 0 && <p className="text-amber-500">{frozenUnits} frozen org unit{frozenUnits > 1 ? "s" : ""}</p>}
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Org Units</CardTitle></CardHeader>
          <CardContent>
            {orgUnits.data?.slice(0, 8).map(u => (
              <div key={u.id} className="flex items-center justify-between py-1 text-sm">
                <span>{u.name}</span>
                <Badge variant="outline" className="text-xs">{u.type}</Badge>
              </div>
            ))}
            {!orgUnits.data?.length && <p className="text-sm text-muted-foreground">No org units defined yet</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Positions</CardTitle></CardHeader>
          <CardContent>
            {positions.data?.slice(0, 8).map(p => (
              <div key={p.id} className="flex items-center justify-between py-1 text-sm">
                <span>{p.title}</span>
                <Badge variant={p.status === "vacant" ? "destructive" : "outline"} className="text-xs">{p.status}</Badge>
              </div>
            ))}
            {!positions.data?.length && <p className="text-sm text-muted-foreground">No positions defined yet</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default OMPortfolioPage;
