/**
 * HR Access Controls Page — Manage HR role assignments and permission mapping
 */

import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ShieldCheck } from "lucide-react";

const roleColor: Record<string, string> = {
  employee: "bg-blue-500/10 text-blue-500",
  manager: "bg-purple-500/10 text-purple-500",
  hrbp: "bg-orange-500/10 text-orange-500",
  admin: "bg-red-500/10 text-red-500",
  workspace_admin: "bg-yellow-500/10 text-yellow-500",
};

export default function HRAccessControlsPage() {
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const assignments = trpc.hr.analytics.listRoleAssignments.useQuery({
    limit: 50,
    ...(roleFilter && roleFilter !== "all" ? { hrRole: roleFilter } : {}),
  });

  if (assignments.isLoading) {
    return <div className="p-6 max-w-7xl mx-auto"><div className="animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-44" /><div className="h-40 bg-muted rounded" /></div></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/hr/security-access"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="w-6 h-6" /> Access Controls</h1>
          <p className="text-muted-foreground">Manage HR role assignments and permission mapping</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All roles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="employee">Employee</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="hrbp">HRBP</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="workspace_admin">Workspace Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3">
        {assignments.data?.length === 0 && (
          <Card><CardContent className="p-4 text-muted-foreground">No role assignments found.</CardContent></Card>
        )}
        {assignments.data?.map((ra) => (
          <Card key={ra.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium flex items-center gap-2">
                  User #{ra.userId}
                  {ra.workerId && <span className="text-sm text-muted-foreground">(Worker #{ra.workerId})</span>}
                </div>
                <div className="flex gap-2">
                  <Badge className={roleColor[ra.hrRole] ?? "bg-gray-500/10 text-gray-400"}>{ra.hrRole}</Badge>
                  <Badge variant={ra.isActive ? "default" : "secondary"}>{ra.isActive ? "Active" : "Inactive"}</Badge>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                Scope: {ra.scope}
                {ra.scopeId && <span> (#{ra.scopeId})</span>}
                {ra.expiresAt && <span> | Expires: {new Date(ra.expiresAt).toLocaleDateString()}</span>}
                {ra.assignedBy && <span> | Assigned by #{ra.assignedBy}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
