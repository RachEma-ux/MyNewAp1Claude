/**
 * HR Job Architecture Page — Job Families, Levels & Role Definitions
 */

import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Layers, ChevronRight } from "lucide-react";

export default function HRJobArchitecturePage() {
  const [tab, setTab] = useState<"families" | "levels">("families");

  const families = trpc.hr.organization.listJobFamilies.useQuery();
  const levels = trpc.hr.organization.listJobLevels.useQuery();

  if (families.isLoading || levels.isLoading) {
    return <div className="p-6 max-w-7xl mx-auto"><div className="animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-44" /><div className="h-40 bg-muted rounded" /></div></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/hr/workforce-planning"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Layers className="w-6 h-6" /> Job Architecture</h1>
          <p className="text-muted-foreground">Manage job families, levels, and role definitions</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant={tab === "families" ? "default" : "outline"} size="sm" onClick={() => setTab("families")}>
          Job Families ({families.data?.length ?? 0})
        </Button>
        <Button variant={tab === "levels" ? "default" : "outline"} size="sm" onClick={() => setTab("levels")}>
          Job Levels ({levels.data?.length ?? 0})
        </Button>
      </div>

      {tab === "families" && (
        <div className="grid gap-3">
          {families.data?.length === 0 && (
            <Card><CardContent className="p-4 text-muted-foreground">No job families defined yet.</CardContent></Card>
          )}
          {families.data?.map((fam) => (
            <Card key={fam.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {fam.name}
                      <Badge variant="outline" className="text-xs">{fam.code}</Badge>
                    </div>
                    {fam.description && <div className="text-sm text-muted-foreground mt-1">{fam.description}</div>}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "levels" && (
        <div className="grid gap-3">
          {levels.data?.length === 0 && (
            <Card><CardContent className="p-4 text-muted-foreground">No job levels defined yet.</CardContent></Card>
          )}
          {levels.data?.map((lvl) => (
            <Card key={lvl.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">Rank {lvl.rank}</Badge>
                    {lvl.name}
                    <span className="text-xs text-muted-foreground">({lvl.code})</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
