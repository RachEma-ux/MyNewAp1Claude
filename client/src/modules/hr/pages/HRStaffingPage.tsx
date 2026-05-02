/**
 * HR Staffing Page — Workspace assignments management
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Search } from "lucide-react";
import { Link } from "wouter";

export default function HRStaffingPage() {
  const [workspaceFilter, setWorkspaceFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const assignmentsQuery = trpc.hr.staffing.listWorkspaceAssignments.useQuery({
    workspaceId: workspaceFilter ? Number(workspaceFilter) : undefined,
    roleCode: roleFilter !== "all" ? roleFilter : undefined,
    limit: 100,
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workspace Staffing</h1>
          <p className="text-muted-foreground">Worker-to-workspace assignments</p>
        </div>
        <Link href="/hr"><Button variant="outline" size="sm">Back to HR</Button></Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input
          placeholder="Filter by workspace ID..."
          className="w-[200px]"
          type="number"
          value={workspaceFilter}
          onChange={(e) => setWorkspaceFilter(e.target.value)}
        />
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="lead">Lead</SelectItem>
            <SelectItem value="reviewer">Reviewer</SelectItem>
            <SelectItem value="observer">Observer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead>Employee #</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Allocation</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(assignmentsQuery.data?.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    {assignmentsQuery.isLoading ? "Loading..." : "No assignments found"}
                  </TableCell>
                </TableRow>
              ) : (
                assignmentsQuery.data?.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.displayName}</TableCell>
                    <TableCell>{a.employeeNumber || "—"}</TableCell>
                    <TableCell>#{a.workspaceId}</TableCell>
                    <TableCell><Badge variant="outline">{a.roleCode}</Badge></TableCell>
                    <TableCell>{a.allocationPct}%</TableCell>
                    <TableCell>{a.assignmentType}</TableCell>
                    <TableCell className="text-sm">{a.startDate}</TableCell>
                    <TableCell className="text-sm">{a.endDate || "—"}</TableCell>
                    <TableCell><Badge>{a.approvalStatus}</Badge></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
