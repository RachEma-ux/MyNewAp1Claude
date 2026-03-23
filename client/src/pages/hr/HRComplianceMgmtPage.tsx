/**
 * HR Compliance Management Page — Obligations, Evidence, Risk Register
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
  active: "bg-green-500/10 text-green-500",
  compliant: "bg-emerald-500/10 text-emerald-500",
  non_compliant: "bg-red-500/10 text-red-500",
  under_review: "bg-purple-500/10 text-purple-500",
  waived: "bg-gray-500/10 text-gray-400",
  expired: "bg-gray-500/10 text-gray-400",
  identified: "bg-yellow-500/10 text-yellow-500",
  assessing: "bg-blue-500/10 text-blue-500",
  mitigating: "bg-purple-500/10 text-purple-500",
  accepted: "bg-orange-500/10 text-orange-500",
  mitigated: "bg-green-500/10 text-green-500",
  closed: "bg-gray-500/10 text-gray-400",
};

const impactColor: Record<string, string> = {
  low: "bg-green-500/10 text-green-500",
  medium: "bg-yellow-500/10 text-yellow-500",
  high: "bg-orange-500/10 text-orange-500",
  critical: "bg-red-500/10 text-red-500",
};

export default function HRComplianceMgmtPage() {
  const [oblStatusFilter, setOblStatusFilter] = useState<string>("all");
  const [riskStatusFilter, setRiskStatusFilter] = useState<string>("all");

  const obligations = trpc.hr.compliance.listComplianceObligations.useQuery({
    limit: 50,
    ...(oblStatusFilter && oblStatusFilter !== "all" ? { status: oblStatusFilter } : {}),
  });
  const evidence = trpc.hr.compliance.listComplianceEvidence.useQuery({ limit: 50 });
  const risks = trpc.hr.compliance.listRiskItems.useQuery({
    limit: 50,
    ...(riskStatusFilter && riskStatusFilter !== "all" ? { status: riskStatusFilter } : {}),
  });

  if (obligations.isLoading) {
    return <div className="p-6 max-w-7xl mx-auto"><div className="animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-44" /><div className="h-40 bg-muted rounded" /></div></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/hr"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">Compliance & Risk</h1>
          <p className="text-muted-foreground">Regulatory obligations, audit evidence, and risk management</p>
        </div>
      </div>

      <Tabs defaultValue="obligations">
        <TabsList>
          <TabsTrigger value="obligations">Obligations</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="risks">Risk Register</TabsTrigger>
        </TabsList>

        <TabsContent value="obligations" className="space-y-4">
          <div className="flex gap-2 mb-2">
            <Select value={oblStatusFilter} onValueChange={setOblStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="compliant">Compliant</SelectItem>
                <SelectItem value="non_compliant">Non-Compliant</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3">
            {obligations.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No compliance obligations.</CardContent></Card>
            )}
            {obligations.data?.map((obl) => (
              <Card key={obl.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{obl.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {obl.category && <span>Category: {obl.category}</span>}
                      {obl.regulation && <span> | Regulation: {obl.regulation}</span>}
                      {obl.dueDate && <span> | Due: {obl.dueDate}</span>}
                    </div>
                  </div>
                  <Badge className={statusColor[obl.status] ?? "bg-gray-500/10 text-gray-400"}>{obl.status.replace(/_/g, " ")}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="evidence" className="space-y-4">
          <div className="grid gap-3">
            {evidence.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No compliance evidence recorded.</CardContent></Card>
            )}
            {evidence.data?.map((ev) => (
              <Card key={ev.id}>
                <CardContent className="p-4">
                  <div className="font-medium">{ev.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {ev.evidenceType && <span>Type: {ev.evidenceType}</span>}
                    {ev.obligationId && <span> | Obligation #{ev.obligationId}</span>}
                    <span> | Recorded: {new Date(ev.recordedAt).toLocaleDateString()}</span>
                  </div>
                  {ev.description && <div className="text-xs text-muted-foreground mt-1">{ev.description}</div>}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="risks" className="space-y-4">
          <div className="flex gap-2 mb-2">
            <Select value={riskStatusFilter} onValueChange={setRiskStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="identified">Identified</SelectItem>
                <SelectItem value="assessing">Assessing</SelectItem>
                <SelectItem value="mitigating">Mitigating</SelectItem>
                <SelectItem value="mitigated">Mitigated</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3">
            {risks.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No risk items.</CardContent></Card>
            )}
            {risks.data?.map((risk) => (
              <Card key={risk.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium">{risk.title}</div>
                    <div className="flex gap-2">
                      {risk.riskScore && <Badge variant="outline">Score: {risk.riskScore}</Badge>}
                      <Badge className={impactColor[risk.impact] ?? ""}>Impact: {risk.impact}</Badge>
                      <Badge className={statusColor[risk.status] ?? "bg-gray-500/10 text-gray-400"}>{risk.status}</Badge>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {risk.category && <span>Category: {risk.category}</span>}
                    <span> | Likelihood: {risk.likelihood}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
