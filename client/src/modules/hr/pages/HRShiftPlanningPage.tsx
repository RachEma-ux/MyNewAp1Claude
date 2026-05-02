/**
 * HR Shift Planning Page — Shift plans with worker assignments
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
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { CalendarDays, Users } from "lucide-react";
import { Link } from "wouter";

const statusVariant = (s: string) => {
  switch (s) {
    case "draft": return "outline" as const;
    case "active": return "default" as const;
    case "completed": return "default" as const;
    case "cancelled": return "destructive" as const;
    case "assigned": return "outline" as const;
    case "confirmed": return "default" as const;
    case "absent": return "destructive" as const;
    case "swapped": return "secondary" as const;
    default: return "outline" as const;
  }
};

export default function HRShiftPlanningPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  const plansQuery = trpc.hr.time.listShiftPlans.useQuery({
    limit: 100,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });
  const assignmentsQuery = trpc.hr.time.listShiftAssignments.useQuery(
    { shiftPlanId: selectedPlanId! },
    { enabled: !!selectedPlanId }
  );
  const planDetailQuery = trpc.hr.time.getShiftPlan.useQuery(
    { id: selectedPlanId! },
    { enabled: !!selectedPlanId }
  );

  const plans = plansQuery.data ?? [];
  const assignments = assignmentsQuery.data ?? [];
  const planDetail = planDetailQuery.data;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shift Planning</h1>
          <p className="text-muted-foreground">Manage shift plans and worker assignments</p>
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
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Shift Time</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {plansQuery.isLoading ? "Loading..." : "No shift plans found"}
                  </TableCell>
                </TableRow>
              ) : (
                plans.map((p: any) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedPlanId(p.id)}
                  >
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.shiftStartTime} - {p.shiftEndTime}</TableCell>
                    <TableCell>{p.startDate}</TableCell>
                    <TableCell>{p.endDate || "—"}</TableCell>
                    <TableCell>{p.maxCapacity || "—"}</TableCell>
                    <TableCell><Badge variant={statusVariant(p.status)}>{p.status}</Badge></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={!!selectedPlanId} onOpenChange={(open) => !open && setSelectedPlanId(null)}>
        <SheetContent className="w-[500px] sm:w-[640px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{planDetail?.name ?? `Shift Plan #${selectedPlanId}`}</SheetTitle>
          </SheetHeader>
          {planDetail && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={statusVariant(planDetail.status)}>{planDetail.status}</Badge></div>
                <div><span className="text-muted-foreground">Shift:</span> {planDetail.shiftStartTime} - {planDetail.shiftEndTime}</div>
                <div><span className="text-muted-foreground">Break:</span> {planDetail.breakMinutes}min</div>
                <div><span className="text-muted-foreground">Capacity:</span> {planDetail.maxCapacity || "Unlimited"}</div>
              </div>

              <div className="flex items-center gap-2 mt-4">
                <Users className="w-4 h-4" />
                <span className="text-sm font-medium">Assignments ({assignments.length})</span>
              </div>

              <div className="space-y-2">
                {assignments.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
                    <div>
                      <span className="font-medium">Worker #{a.workerId}</span>
                      <span className="text-muted-foreground ml-2">{a.assignedDate}</span>
                    </div>
                    <Badge variant={statusVariant(a.status)}>{a.status}</Badge>
                  </div>
                ))}
                {assignments.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {assignmentsQuery.isLoading ? "Loading..." : "No assignments yet"}
                  </p>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
