/**
 * HR Overtime Page — Overtime requests with approval workflow
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Clock } from "lucide-react";
import { Link } from "wouter";

const statusVariant = (s: string) => {
  switch (s) {
    case "pending": return "outline" as const;
    case "approved": return "default" as const;
    case "rejected": return "destructive" as const;
    case "cancelled": return "secondary" as const;
    default: return "outline" as const;
  }
};

export default function HROvertimePage() {
  const [statusFilter, setStatusFilter] = useState("all");

  const requestsQuery = trpc.hr.time.listOvertimeRequests.useQuery({
    limit: 100,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const requests = requestsQuery.data ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Overtime Requests</h1>
          <p className="text-muted-foreground">Submit and track overtime requests</p>
        </div>
        <Link href="/hr">
          <Button variant="outline" size="sm">Back to HR</Button>
        </Link>
      </div>

      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Worker</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {requestsQuery.isLoading ? "Loading..." : "No overtime requests found"}
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">#{r.id}</TableCell>
                    <TableCell>Worker #{r.workerId}</TableCell>
                    <TableCell>{r.requestDate}</TableCell>
                    <TableCell>{r.startTime}</TableCell>
                    <TableCell>{r.endTime}</TableCell>
                    <TableCell>{r.hours}h</TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.reason}</TableCell>
                    <TableCell><Badge variant={statusVariant(r.status)}>{r.status}</Badge></TableCell>
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
