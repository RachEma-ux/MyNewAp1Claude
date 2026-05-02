/**
 * OM List — Tabbed list of all OM entities
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function OMListPage({ workspaceId }: { workspaceId: number }) {
  const [tab, setTab] = useState("org_units");
  const entities = trpc.organizationManagement.legalEntities.list.useQuery({ workspaceId });
  const orgUnits = trpc.organizationManagement.orgUnits.list.useQuery({ workspaceId });
  const jobs = trpc.organizationManagement.jobs.list.useQuery({ workspaceId });
  const positions = trpc.organizationManagement.positions.list.useQuery({ workspaceId });
  const costCenters = trpc.organizationManagement.costCenters.list.useQuery({ workspaceId });
  const reporting = trpc.organizationManagement.reporting.list.useQuery({ workspaceId });

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">OM Records</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="org_units">Org Units ({orgUnits.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="positions">Positions ({positions.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="jobs">Jobs ({jobs.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="entities">Entities ({entities.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="cost_centers">Cost Centers ({costCenters.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="reporting">Reporting ({reporting.data?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="org_units">
          <Card><CardContent className="pt-4">
            {orgUnits.data?.map(u => (
              <div key={u.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                <div><span className="font-medium">{u.name}</span> <span className="text-muted-foreground ml-2">{u.code}</span></div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{u.type}</Badge>
                  <Badge variant={u.status === "active" ? "default" : "secondary"} className="text-xs">{u.status}</Badge>
                </div>
              </div>
            ))}
            {!orgUnits.data?.length && <p className="text-muted-foreground text-sm">No org units</p>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="positions">
          <Card><CardContent className="pt-4">
            {positions.data?.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                <div><span className="font-medium">{p.title}</span> <span className="text-muted-foreground ml-2">{p.positionCode}</span></div>
                <Badge variant={p.status === "vacant" ? "destructive" : p.status === "filled" ? "default" : "secondary"} className="text-xs">{p.status}</Badge>
              </div>
            ))}
            {!positions.data?.length && <p className="text-muted-foreground text-sm">No positions</p>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="jobs">
          <Card><CardContent className="pt-4">
            {jobs.data?.map(j => (
              <div key={j.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                <div><span className="font-medium">{j.title}</span> <span className="text-muted-foreground ml-2">{j.code}</span></div>
                <div className="flex items-center gap-2">
                  {j.family && <Badge variant="outline" className="text-xs">{j.family}</Badge>}
                  <Badge variant={j.status === "active" ? "default" : "secondary"} className="text-xs">{j.status}</Badge>
                </div>
              </div>
            ))}
            {!jobs.data?.length && <p className="text-muted-foreground text-sm">No jobs</p>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="entities">
          <Card><CardContent className="pt-4">
            {entities.data?.map(e => (
              <div key={e.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                <div><span className="font-medium">{e.name}</span> <span className="text-muted-foreground ml-2">{e.code}</span></div>
                <Badge variant={e.status === "active" ? "default" : "secondary"} className="text-xs">{e.type}</Badge>
              </div>
            ))}
            {!entities.data?.length && <p className="text-muted-foreground text-sm">No entities</p>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="cost_centers">
          <Card><CardContent className="pt-4">
            {costCenters.data?.map(c => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                <div><span className="font-medium">{c.name}</span> <span className="text-muted-foreground ml-2">{c.code}</span></div>
                <Badge variant={c.status === "active" ? "default" : "secondary"} className="text-xs">{c.status}</Badge>
              </div>
            ))}
            {!costCenters.data?.length && <p className="text-muted-foreground text-sm">No cost centers</p>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="reporting">
          <Card><CardContent className="pt-4">
            {reporting.data?.map(r => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                <div>Position {r.positionId} → reports to {r.reportsToPositionId}</div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{r.type}</Badge>
                  <Badge variant={r.status === "active" ? "default" : "secondary"} className="text-xs">{r.status}</Badge>
                </div>
              </div>
            ))}
            {!reporting.data?.length && <p className="text-muted-foreground text-sm">No reporting relationships</p>}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default OMListPage;
