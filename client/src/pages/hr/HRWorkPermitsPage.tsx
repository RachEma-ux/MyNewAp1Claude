/**
 * HR Work Permits Page — Work Authorization & Permit Tracking
 */

import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Shield } from "lucide-react";

const statusColor: Record<string, string> = {
  active: "bg-green-500/10 text-green-500",
  expired: "bg-red-500/10 text-red-500",
  pending_renewal: "bg-yellow-500/10 text-yellow-500",
  revoked: "bg-gray-500/10 text-gray-400",
  cancelled: "bg-gray-500/10 text-gray-400",
};

export default function HRWorkPermitsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const permits = trpc.hr.compliance.listWorkPermits.useQuery({
    limit: 50,
    ...(statusFilter && statusFilter !== "all" ? { status: statusFilter } : {}),
  });

  if (permits.isLoading) {
    return <div className="p-6 max-w-7xl mx-auto"><div className="animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-44" /><div className="h-40 bg-muted rounded" /></div></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/hr/employee-records"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="w-6 h-6" /> Work Permits & Compliance</h1>
          <p className="text-muted-foreground">Track work authorization and permit expiry</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="pending_renewal">Pending Renewal</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3">
        {permits.data?.length === 0 && (
          <Card><CardContent className="p-4 text-muted-foreground">No work permits found.</CardContent></Card>
        )}
        {permits.data?.map((p) => (
          <Card key={p.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium">{p.permitType.replace(/_/g, " ")}</div>
                <Badge className={statusColor[p.status] ?? "bg-gray-500/10 text-gray-400"}>{p.status.replace(/_/g, " ")}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {p.permitNumber && <span>#{p.permitNumber} | </span>}
                {p.issuingCountry && <span>{p.issuingCountry} | </span>}
                {p.issueDate && <span>Issued: {p.issueDate} | </span>}
                {p.expiryDate && <span>Expires: {p.expiryDate}</span>}
              </div>
              {p.issuingAuthority && <div className="text-xs text-muted-foreground mt-1">Authority: {p.issuingAuthority}</div>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
