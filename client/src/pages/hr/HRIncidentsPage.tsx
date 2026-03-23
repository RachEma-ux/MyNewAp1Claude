/**
 * HR Incidents Page — Workplace Incident Reports
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

const statusColor: Record<string, string> = {
  reported: "bg-yellow-500/10 text-yellow-500",
  under_investigation: "bg-purple-500/10 text-purple-500",
  action_required: "bg-orange-500/10 text-orange-500",
  resolved: "bg-green-500/10 text-green-500",
  closed: "bg-gray-500/10 text-gray-400",
};

const severityColor: Record<string, string> = {
  low: "bg-green-500/10 text-green-500",
  medium: "bg-yellow-500/10 text-yellow-500",
  high: "bg-orange-500/10 text-orange-500",
  critical: "bg-red-500/10 text-red-500",
};

export default function HRIncidentsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");

  const incidents = trpc.hr.compliance.listIncidentReports.useQuery({
    limit: 50,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(severityFilter ? { severity: severityFilter } : {}),
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Incident Reports</h1>
        <p className="text-muted-foreground">Workplace incident tracking and resolution</p>
      </div>

      <div className="flex gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="reported">Reported</SelectItem>
            <SelectItem value="under_investigation">Under Investigation</SelectItem>
            <SelectItem value="action_required">Action Required</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="All severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3">
        {incidents.data?.length === 0 && (
          <Card><CardContent className="p-4 text-muted-foreground">No incident reports.</CardContent></Card>
        )}
        {incidents.data?.map((inc) => (
          <Card key={inc.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium">{inc.title}</div>
                <div className="flex gap-2">
                  <Badge className={severityColor[inc.severity] ?? ""}>{inc.severity}</Badge>
                  <Badge className={statusColor[inc.status] ?? "bg-gray-500/10 text-gray-400"}>{inc.status.replace(/_/g, " ")}</Badge>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                Category: {inc.category.replace(/_/g, " ")} | Date: {inc.incidentDate}
                {inc.location && <span> | Location: {inc.location}</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{inc.description}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
