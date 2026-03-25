/**
 * CV Portfolio — Overview of all culture value sets, definitions, and health
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Heart, Shield, Globe, Cog, Plus, CheckCircle, AlertTriangle } from "lucide-react";

export function CVPortfolioPage({ workspaceId }: { workspaceId: number }) {
  const [tab, setTab] = useState("overview");
  const valueSets = trpc.cultureValues.valueSets.list.useQuery({ workspaceId });

  const activeSet = valueSets.data?.find(s => s.status === "active");
  const draftSets = valueSets.data?.filter(s => s.status === "draft") ?? [];

  // Fetch definitions for the active set
  const definitions = trpc.cultureValues.definitions.list.useQuery(
    { workspaceId, valueSetId: activeSet?.id ?? 0 },
    { enabled: !!activeSet }
  );

  const ops = trpc.cultureValues.operationalization.list.useQuery(
    { workspaceId, valueSetId: activeSet?.id },
    { enabled: !!activeSet }
  );

  const stats = [
    { label: "Value Sets", count: valueSets.data?.length ?? 0, icon: Heart, color: "text-purple-500" },
    { label: "Active Values", count: definitions.data?.length ?? 0, icon: Shield, color: "text-green-500" },
    { label: "Ops Templates", count: ops.data?.length ?? 0, icon: Cog, color: "text-blue-500" },
    { label: "Draft Sets", count: draftSets.length, icon: Globe, color: "text-amber-500" },
  ];

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Culture Values</h1>
        <div className="flex gap-2">
          {activeSet && (
            <Badge variant="outline" className="text-green-600">v{activeSet.version} Active</Badge>
          )}
          <Link href={`/w/${workspaceId}/cv/wizard`}>
            <Button size="sm" variant="outline"><Plus className="w-4 h-4 mr-1" /> New Value Set</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sets">All Sets ({valueSets.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="definitions">Definitions ({definitions.data?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {!activeSet && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-amber-500 text-sm">
                  <AlertTriangle className="w-4 h-4" /> No active value set. Create and publish one to get started.
                </div>
              </CardContent>
            </Card>
          )}
          {activeSet && definitions.data && (
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Active Values</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {definitions.data.map(d => (
                    <div key={d.id} className="flex items-center justify-between py-1 text-sm">
                      <div>
                        <span className="font-medium">{d.name}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{d.code}</span>
                      </div>
                      <Badge variant="outline" className="text-xs">{d.type}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm">Health</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    {definitions.data.length >= 3 && definitions.data.length <= 7 ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    )}
                    <span>Value count: {definitions.data.length} (target: 3–7)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Active set: v{activeSet.version}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(ops.data?.length ?? 0) > 0 ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    )}
                    <span>Operationalization templates: {ops.data?.length ?? 0}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="sets">
          <Card><CardContent className="pt-4">
            {valueSets.data?.map(s => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                <div>
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground ml-2">v{s.version}</span>
                </div>
                <Badge variant={s.status === "active" ? "default" : s.status === "draft" ? "outline" : "secondary"} className="text-xs">{s.status}</Badge>
              </div>
            ))}
            {!valueSets.data?.length && <p className="text-sm text-muted-foreground">No value sets yet</p>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="definitions">
          <Card><CardContent className="pt-4">
            {definitions.data?.map(d => (
              <div key={d.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                <div>
                  <span className="font-medium">{d.name}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{d.code}</span>
                  {d.description && <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{d.type}</Badge>
                  <Badge variant={d.status === "active" ? "default" : "secondary"} className="text-xs">{d.status}</Badge>
                </div>
              </div>
            ))}
            {!definitions.data?.length && <p className="text-sm text-muted-foreground">{activeSet ? "No definitions in active set" : "No active value set"}</p>}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default CVPortfolioPage;
