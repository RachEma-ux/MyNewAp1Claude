/**
 * HR Grievances Page — Grievances, Disciplinary Actions, Investigations
 */

import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ArrowLeft } from "lucide-react";

const statusColor: Record<string, string> = {
  filed: "bg-yellow-500/10 text-yellow-500",
  under_review: "bg-blue-500/10 text-blue-500",
  investigating: "bg-purple-500/10 text-purple-500",
  resolved: "bg-green-500/10 text-green-500",
  dismissed: "bg-gray-500/10 text-gray-400",
  closed: "bg-gray-500/10 text-gray-400",
  escalated: "bg-red-500/10 text-red-500",
  withdrawn: "bg-gray-500/10 text-gray-400",
  active: "bg-green-500/10 text-green-500",
  appealed: "bg-yellow-500/10 text-yellow-500",
  overturned: "bg-blue-500/10 text-blue-500",
  expired: "bg-gray-500/10 text-gray-400",
  completed: "bg-green-500/10 text-green-500",
  opened: "bg-yellow-500/10 text-yellow-500",
  in_progress: "bg-blue-500/10 text-blue-500",
  pending_review: "bg-purple-500/10 text-purple-500",
  closed_substantiated: "bg-red-500/10 text-red-500",
  closed_unsubstantiated: "bg-green-500/10 text-green-500",
  closed_inconclusive: "bg-gray-500/10 text-gray-400",
  cancelled: "bg-gray-500/10 text-gray-400",
};

const severityColor: Record<string, string> = {
  low: "bg-green-500/10 text-green-500",
  medium: "bg-yellow-500/10 text-yellow-500",
  high: "bg-orange-500/10 text-orange-500",
  critical: "bg-red-500/10 text-red-500",
};

export default function HRGrievancesPage() {
  const [gStatusFilter, setGStatusFilter] = useState<string>("");
  const [invStatusFilter, setInvStatusFilter] = useState<string>("");

  const grievances = trpc.hr.relations.listGrievances.useQuery({
    limit: 50,
    ...(gStatusFilter ? { status: gStatusFilter } : {}),
  });
  const disciplinary = trpc.hr.relations.listDisciplinaryActions.useQuery({ limit: 50 });
  const investigations = trpc.hr.relations.listInvestigations.useQuery({
    limit: 50,
    ...(invStatusFilter ? { status: invStatusFilter } : {}),
  });

  if (grievances.isLoading) {
    return <div className="p-6 max-w-7xl mx-auto"><div className="animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-36" /><div className="h-40 bg-muted rounded" /></div></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/hr"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">Employee Relations</h1>
          <p className="text-muted-foreground">Grievances, disciplinary actions, and investigations</p>
        </div>
      </div>

      {grievances.isError && (
        <Card className="border-red-500/50"><CardContent className="p-4 text-red-500 text-sm">Failed to load relations data.</CardContent></Card>
      )}

      <Tabs defaultValue="grievances">
        <TabsList>
          <TabsTrigger value="grievances">Grievances</TabsTrigger>
          <TabsTrigger value="disciplinary">Disciplinary</TabsTrigger>
          <TabsTrigger value="investigations">Investigations</TabsTrigger>
        </TabsList>

        <TabsContent value="grievances" className="space-y-4">
          <div className="flex gap-2 mb-2">
            <Select value={gStatusFilter} onValueChange={setGStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                <SelectItem value="filed">Filed</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="investigating">Investigating</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3">
            {grievances.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No grievances filed.</CardContent></Card>
            )}
            {grievances.data?.map((g) => (
              <Card key={g.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium">{g.subject}</div>
                    <div className="flex gap-2">
                      <Badge className={severityColor[g.severity] ?? ""}>{g.severity}</Badge>
                      <Badge className={statusColor[g.status] ?? "bg-gray-500/10 text-gray-400"}>{g.status}</Badge>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Category: {g.category} | Filed by Worker #{g.filedByWorkerId}
                    {g.isConfidential && " | Confidential"}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="disciplinary" className="space-y-4">
          <div className="grid gap-3">
            {disciplinary.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No disciplinary actions.</CardContent></Card>
            )}
            {disciplinary.data?.map((d) => (
              <Card key={d.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">Worker #{d.workerId} — {d.type.replace(/_/g, " ")}</div>
                    <div className="text-sm text-muted-foreground">{d.reason}</div>
                    {d.issuedAt && <div className="text-xs text-muted-foreground">Issued: {d.issuedAt}</div>}
                  </div>
                  <Badge className={statusColor[d.status] ?? "bg-gray-500/10 text-gray-400"}>{d.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="investigations" className="space-y-4">
          <div className="flex gap-2 mb-2">
            <Select value={invStatusFilter} onValueChange={setInvStatusFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                <SelectItem value="opened">Opened</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="closed_substantiated">Substantiated</SelectItem>
                <SelectItem value="closed_unsubstantiated">Unsubstantiated</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3">
            {investigations.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No investigations.</CardContent></Card>
            )}
            {investigations.data?.map((inv) => (
              <Card key={inv.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{inv.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {inv.category && <span>Category: {inv.category}</span>}
                      {inv.isConfidential && " | Confidential"}
                    </div>
                  </div>
                  <Badge className={statusColor[inv.status] ?? "bg-gray-500/10 text-gray-400"}>{inv.status.replace(/_/g, " ")}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
