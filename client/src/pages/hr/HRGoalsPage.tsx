/**
 * HR Goals Page — Employee goals within performance cycles
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import { Target } from "lucide-react";
import { Link } from "wouter";

const statusVariant = (s: string) => {
  switch (s) {
    case "draft": return "outline" as const;
    case "active": return "default" as const;
    case "completed": return "default" as const;
    case "deferred": return "secondary" as const;
    case "cancelled": return "destructive" as const;
    default: return "outline" as const;
  }
};

export default function HRGoalsPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const goalsQuery = trpc.hr.performance.listGoals.useQuery({
    limit: 100,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });
  const detailQuery = trpc.hr.performance.getGoal.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId }
  );

  const goals = goalsQuery.data ?? [];
  const detail = detailQuery.data;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Goals</h1>
          <p className="text-muted-foreground">Employee goals and objectives tracking</p>
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
            <SelectItem value="deferred">Deferred</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Worker</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {goals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {goalsQuery.isLoading ? "Loading..." : "No goals found"}
                  </TableCell>
                </TableRow>
              ) : (
                goals.map((g: any) => (
                  <TableRow
                    key={g.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedId(g.id)}
                  >
                    <TableCell className="font-medium max-w-[200px] truncate">{g.title}</TableCell>
                    <TableCell>Worker #{g.workerId}</TableCell>
                    <TableCell>Cycle #{g.cycleId}</TableCell>
                    <TableCell><Badge variant="outline">{g.category || "—"}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={g.currentProgress ?? 0} className="w-16 h-2" />
                        <span className="text-xs text-muted-foreground">{g.currentProgress ?? 0}%</span>
                      </div>
                    </TableCell>
                    <TableCell>{g.weight}%</TableCell>
                    <TableCell><Badge variant={statusVariant(g.status)}>{g.status}</Badge></TableCell>
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
            <SheetTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" /> {detail?.title ?? `Goal #${selectedId}`}
            </SheetTitle>
          </SheetHeader>
          {detail && (
            <div className="space-y-4 mt-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Worker:</span> #{detail.workerId}</div>
                <div><span className="text-muted-foreground">Cycle:</span> #{detail.cycleId}</div>
                <div><span className="text-muted-foreground">Category:</span> {detail.category || "—"}</div>
                <div><span className="text-muted-foreground">Weight:</span> {detail.weight}%</div>
                <div><span className="text-muted-foreground">Due:</span> {detail.dueDate || "—"}</div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={statusVariant(detail.status)}>{detail.status}</Badge></div>
              </div>
              <div>
                <span className="text-muted-foreground">Progress</span>
                <Progress value={detail.currentProgress ?? 0} className="h-2 mt-1" />
                <div className="text-xs text-muted-foreground mt-1">{detail.currentProgress ?? 0}%</div>
              </div>
              {detail.targetMetric && (
                <div><span className="text-muted-foreground">Target Metric:</span> {detail.targetMetric}</div>
              )}
              {detail.description && (
                <div>
                  <span className="text-muted-foreground">Description:</span>
                  <p className="mt-1">{detail.description}</p>
                </div>
              )}
              {detail.employeeNotes && (
                <div>
                  <span className="text-muted-foreground">Employee Notes:</span>
                  <p className="mt-1">{detail.employeeNotes}</p>
                </div>
              )}
              {detail.managerNotes && (
                <div>
                  <span className="text-muted-foreground">Manager Notes:</span>
                  <p className="mt-1">{detail.managerNotes}</p>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Manager approved: {detail.managerApproved ? "Yes" : "No"}</span>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
