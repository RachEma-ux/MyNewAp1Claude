/**
 * HR Engagement Page — Programs, Wellbeing Resources, Recognition
 */

import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { ArrowLeft } from "lucide-react";

const statusColor: Record<string, string> = {
  planned: "bg-gray-500/10 text-gray-400",
  active: "bg-green-500/10 text-green-500",
  completed: "bg-blue-500/10 text-blue-500",
  cancelled: "bg-red-500/10 text-red-500",
  nominated: "bg-yellow-500/10 text-yellow-500",
  approved: "bg-blue-500/10 text-blue-500",
  awarded: "bg-emerald-500/10 text-emerald-500",
  declined: "bg-red-500/10 text-red-500",
};

export default function HREngagementPage() {
  const programs = trpc.hr.engagement.listEngagementPrograms.useQuery({ limit: 50 });
  const wellbeing = trpc.hr.engagement.listWellbeingResources.useQuery({ limit: 50, isActive: true });
  const recognitionPrograms = trpc.hr.engagement.listRecognitionPrograms.useQuery({ limit: 50, isActive: true });
  const recognitionEvents = trpc.hr.engagement.listRecognitionEvents.useQuery({ limit: 50 });

  if (programs.isLoading) {
    return <div className="p-6 max-w-7xl mx-auto"><div className="animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-48" /><div className="h-40 bg-muted rounded" /></div></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/hr"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">Engagement & Wellbeing</h1>
          <p className="text-muted-foreground">Programs, wellbeing resources, and employee recognition</p>
        </div>
      </div>

      <Tabs defaultValue="programs">
        <TabsList>
          <TabsTrigger value="programs">Programs</TabsTrigger>
          <TabsTrigger value="wellbeing">Wellbeing</TabsTrigger>
          <TabsTrigger value="recognition">Recognition</TabsTrigger>
        </TabsList>

        <TabsContent value="programs" className="space-y-4">
          <div className="grid gap-3">
            {programs.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No engagement programs yet.</CardContent></Card>
            )}
            {programs.data?.map((p) => (
              <Card key={p.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {p.category && <span>Category: {p.category}</span>}
                      {p.participantCount ? <span> | Participants: {p.participantCount}</span> : null}
                    </div>
                    {p.startDate && <div className="text-xs text-muted-foreground">{p.startDate} – {p.endDate ?? "ongoing"}</div>}
                  </div>
                  <Badge className={statusColor[p.status] ?? "bg-gray-500/10 text-gray-400"}>{p.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="wellbeing" className="space-y-4">
          <div className="grid gap-3">
            {wellbeing.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No wellbeing resources yet.</CardContent></Card>
            )}
            {wellbeing.data?.map((w) => (
              <Card key={w.id}>
                <CardContent className="p-4">
                  <div className="font-medium">{w.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {w.category && <span>Category: {w.category}</span>}
                    {w.resourceType && <span> | Type: {w.resourceType}</span>}
                  </div>
                  {w.description && <div className="text-xs text-muted-foreground mt-1">{w.description}</div>}
                  {w.url && <a href={w.url} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline">{w.url}</a>}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="recognition" className="space-y-4">
          {recognitionPrograms.data && recognitionPrograms.data.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {recognitionPrograms.data.map((rp) => (
                <Card key={rp.id}>
                  <CardContent className="p-3 text-center">
                    <div className="font-medium text-sm">{rp.name}</div>
                    {rp.category && <div className="text-xs text-muted-foreground">{rp.category}</div>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <div className="grid gap-3">
            {recognitionEvents.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No recognition events yet.</CardContent></Card>
            )}
            {recognitionEvents.data?.map((e) => (
              <Card key={e.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{e.title}</div>
                    <div className="text-sm text-muted-foreground">
                      Recipient: Worker #{e.recipientWorkerId}
                      {e.nominatedByWorkerId && <span> | Nominated by #{e.nominatedByWorkerId}</span>}
                      {e.value && <span> | Value: {e.value}</span>}
                    </div>
                  </div>
                  <Badge className={statusColor[e.status] ?? "bg-gray-500/10 text-gray-400"}>{e.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
