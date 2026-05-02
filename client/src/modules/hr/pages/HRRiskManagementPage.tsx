/**
 * HR Risk Management Page — Identify, assess, and mitigate HR-related risks
 */

import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, AlertTriangle } from "lucide-react";

const statusColor: Record<string, string> = {
  identified: "bg-blue-500/10 text-blue-500",
  assessing: "bg-purple-500/10 text-purple-500",
  mitigating: "bg-yellow-500/10 text-yellow-500",
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

export default function HRRiskManagementPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const risks = trpc.hr.compliance.listRiskItems.useQuery({
    limit: 50,
    ...(statusFilter && statusFilter !== "all" ? { status: statusFilter } : {}),
  });

  if (risks.isLoading) {
    return <div className="p-6 max-w-7xl mx-auto"><div className="animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-44" /><div className="h-40 bg-muted rounded" /></div></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/hr/compliance"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><AlertTriangle className="w-6 h-6" /> Risk Management</h1>
          <p className="text-muted-foreground">Identify, assess, and mitigate HR-related risks</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="identified">Identified</SelectItem>
            <SelectItem value="assessing">Assessing</SelectItem>
            <SelectItem value="mitigating">Mitigating</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="mitigated">Mitigated</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3">
        {risks.data?.length === 0 && (
          <Card><CardContent className="p-4 text-muted-foreground">No risk items found.</CardContent></Card>
        )}
        {risks.data?.map((risk) => (
          <Card key={risk.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium">{risk.title}</div>
                <div className="flex gap-2">
                  <Badge className={impactColor[risk.impact] ?? ""}>Impact: {risk.impact}</Badge>
                  <Badge className={statusColor[risk.status] ?? "bg-gray-500/10 text-gray-400"}>{risk.status.replace(/_/g, " ")}</Badge>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {risk.category && <span>Category: {risk.category.replace(/_/g, " ")} | </span>}
                Likelihood: {risk.likelihood}
                {risk.riskScore != null && <span> | Score: {risk.riskScore}</span>}
                {risk.reviewDate && <span> | Review: {risk.reviewDate}</span>}
              </div>
              {risk.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{risk.description}</div>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
