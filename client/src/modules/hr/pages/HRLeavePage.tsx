/**
 * HR Leave Page — Leave requests with approval workflow
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
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { Calendar, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Link } from "wouter";

const statusVariant = (s: string) => {
  switch (s) {
    case "pending": return "outline" as const;
    case "approved": return "default" as const;
    case "in_progress": return "default" as const;
    case "completed": return "default" as const;
    case "rejected": return "destructive" as const;
    case "cancelled": return "secondary" as const;
    default: return "outline" as const;
  }
};

export default function HRLeavePage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const requestsQuery = trpc.hr.time.listLeaveRequests.useQuery({
    limit: 100,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });
  const leaveTypesQuery = trpc.hr.time.listLeaveTypes.useQuery();
  const detailQuery = trpc.hr.time.getLeaveRequest.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId }
  );

  const requests = requestsQuery.data ?? [];
  const leaveTypes = leaveTypesQuery.data ?? [];
  const detail = detailQuery.data;

  const getTypeName = (typeId: number) =>
    leaveTypes.find((t: any) => t.id === typeId)?.name ?? `Type #${typeId}`;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leave Requests</h1>
          <p className="text-muted-foreground">Submit and track leave requests</p>
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
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
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
                <TableHead>Type</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {requestsQuery.isLoading ? "Loading..." : "No leave requests found"}
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((r: any) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedId(r.id)}
                  >
                    <TableCell className="font-medium">#{r.id}</TableCell>
                    <TableCell>Worker #{r.workerId}</TableCell>
                    <TableCell>{getTypeName(r.leaveTypeId)}</TableCell>
                    <TableCell>{r.startDate}</TableCell>
                    <TableCell>{r.endDate}</TableCell>
                    <TableCell>{r.totalDays}</TableCell>
                    <TableCell><Badge variant={statusVariant(r.status)}>{r.status.replace("_", " ")}</Badge></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="w-[500px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Leave Request #{selectedId}</SheetTitle>
          </SheetHeader>
          {detail && (
            <div className="space-y-4 mt-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Worker:</span> #{detail.workerId}</div>
                <div><span className="text-muted-foreground">Type:</span> {getTypeName(detail.leaveTypeId)}</div>
                <div><span className="text-muted-foreground">Start:</span> {detail.startDate}</div>
                <div><span className="text-muted-foreground">End:</span> {detail.endDate}</div>
                <div><span className="text-muted-foreground">Total Days:</span> {detail.totalDays}</div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={statusVariant(detail.status)}>{detail.status}</Badge></div>
              </div>
              {detail.reason && (
                <div>
                  <span className="text-muted-foreground">Reason:</span>
                  <p className="mt-1">{detail.reason}</p>
                </div>
              )}
              {detail.rejectionReason && (
                <div>
                  <span className="text-muted-foreground text-red-500">Rejection Reason:</span>
                  <p className="mt-1">{detail.rejectionReason}</p>
                </div>
              )}
              {detail.approvedBy && (
                <div><span className="text-muted-foreground">Approved by:</span> #{detail.approvedBy}</div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
