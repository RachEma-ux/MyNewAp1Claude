/**
 * HR Timesheet Page — Time entries with status tracking and submission
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Clock, FileText, CheckCircle2, Send } from "lucide-react";
import { Link } from "wouter";

const statusVariant = (s: string) => {
  switch (s) {
    case "draft": return "outline" as const;
    case "submitted": return "default" as const;
    case "approved": return "default" as const;
    case "rejected": return "destructive" as const;
    default: return "outline" as const;
  }
};

export default function HRTimesheetPage() {
  const [statusFilter, setStatusFilter] = useState("all");

  const summaryQuery = trpc.hr.time.summary.useQuery();
  const entriesQuery = trpc.hr.time.listTimeEntries.useQuery({
    limit: 100,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const summary = summaryQuery.data ?? { pendingLeave: 0, pendingOvertime: 0, activeShifts: 0, draftTimeEntries: 0 };
  const entries = entriesQuery.data ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Timesheet</h1>
          <p className="text-muted-foreground">Track daily time entries</p>
        </div>
        <Link href="/hr">
          <Button variant="outline" size="sm">Back to HR</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Draft Entries</div>
            <div className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-4 h-4" /> {summary.draftTimeEntries}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Pending Leave</div>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Clock className="w-4 h-4" /> {summary.pendingLeave}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Pending Overtime</div>
            <div className="text-2xl font-bold">{summary.pendingOvertime}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Active Shifts</div>
            <div className="text-2xl font-bold">{summary.activeShifts}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {entriesQuery.isLoading ? "Loading..." : "No time entries found"}
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.entryDate}</TableCell>
                    <TableCell>{e.entryType}</TableCell>
                    <TableCell>{e.startTime || "—"}</TableCell>
                    <TableCell>{e.endTime || "—"}</TableCell>
                    <TableCell>{e.hoursWorked || "—"}</TableCell>
                    <TableCell><Badge variant={statusVariant(e.status)}>{e.status}</Badge></TableCell>
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
