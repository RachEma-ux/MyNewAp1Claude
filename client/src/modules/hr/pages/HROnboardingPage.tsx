/**
 * HR Onboarding Page — Onboarding cases with auto-generated task checklists
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, UserPlus, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

const statusColor = (s: string) => {
  switch (s) {
    case "pending": return "outline";
    case "in_progress": return "default";
    case "completed": return "default";
    case "cancelled": return "destructive";
    case "skipped": return "secondary";
    case "blocked": return "destructive";
    default: return "outline";
  }
};

const priorityIcon = (p: string) => {
  switch (p) {
    case "critical": return <AlertTriangle className="w-3 h-3 text-red-500" />;
    case "high": return <AlertTriangle className="w-3 h-3 text-orange-500" />;
    default: return null;
  }
};

export default function HROnboardingPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [taskCategoryFilter, setTaskCategoryFilter] = useState<string>("all");

  const summaryQuery = trpc.hr.lifecycle.summary.useQuery();
  const casesQuery = trpc.hr.lifecycle.listOnboardingCases.useQuery({
    limit: 100,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });
  const tasksQuery = trpc.hr.lifecycle.listOnboardingTasks.useQuery(
    {
      caseId: selectedCaseId!,
      category: taskCategoryFilter !== "all" ? taskCategoryFilter : undefined,
    },
    { enabled: !!selectedCaseId }
  );
  const caseDetailQuery = trpc.hr.lifecycle.getOnboardingCase.useQuery(
    { id: selectedCaseId! },
    { enabled: !!selectedCaseId }
  );

  const summary = summaryQuery.data ?? { activeOnboarding: 0, activeOffboarding: 0, pendingTasks: 0 };
  const cases = casesQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];
  const caseDetail = caseDetailQuery.data;

  const taskProgress = caseDetail
    ? caseDetail.totalTasks > 0
      ? Math.round((caseDetail.completedTasks / caseDetail.totalTasks) * 100)
      : 0
    : 0;

  if (casesQuery.isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-40 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/hr">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Onboarding</h1>
          <p className="text-muted-foreground">Track new hire onboarding workflows</p>
        </div>
      </div>

      {casesQuery.isError && (
        <Card className="border-red-500/50">
          <CardContent className="p-4 text-red-500 text-sm">Failed to load onboarding data.</CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Onboarding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <UserPlus className="w-5 h-5" /> {summary.activeOnboarding}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Clock className="w-5 h-5" /> {summary.pendingTasks}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Offboarding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.activeOffboarding}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cases Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Case #</TableHead>
                <TableHead>Worker</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {casesQuery.isLoading ? "Loading..." : "No onboarding cases found"}
                  </TableCell>
                </TableRow>
              ) : (
                cases.map((c: any) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedCaseId(c.id)}
                  >
                    <TableCell className="font-medium">#{c.id}</TableCell>
                    <TableCell>Worker #{c.workerId || "—"}</TableCell>
                    <TableCell>{c.plannedStartDate || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={c.totalTasks > 0 ? (c.completedTasks / c.totalTasks) * 100 : 0} className="w-20 h-2" />
                        <span className="text-xs text-muted-foreground">{c.completedTasks}/{c.totalTasks}</span>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant={statusColor(c.status)}>{c.status.replace("_", " ")}</Badge></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Task Detail Panel */}
      <Sheet open={!!selectedCaseId} onOpenChange={(open) => !open && setSelectedCaseId(null)}>
        <SheetContent className="w-[500px] sm:w-[640px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Onboarding Case #{selectedCaseId}</SheetTitle>
          </SheetHeader>
          {caseDetail && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={statusColor(caseDetail.status)}>{caseDetail.status}</Badge></div>
                <div><span className="text-muted-foreground">Planned Start:</span> {caseDetail.plannedStartDate || "—"}</div>
                <div><span className="text-muted-foreground">Actual Start:</span> {caseDetail.actualStartDate || "—"}</div>
                <div><span className="text-muted-foreground">Progress:</span> {taskProgress}%</div>
              </div>
              <Progress value={taskProgress} className="h-2" />

              {/* Task Category Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Tasks</span>
                <Select value={taskCategoryFilter} onValueChange={setTaskCategoryFilter}>
                  <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="document_collection">Documents</SelectItem>
                    <SelectItem value="equipment_setup">Equipment</SelectItem>
                    <SelectItem value="access_provisioning">Access</SelectItem>
                    <SelectItem value="orientation">Orientation</SelectItem>
                    <SelectItem value="training">Training</SelectItem>
                    <SelectItem value="compliance">Compliance</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Task List */}
              <div className="space-y-2">
                {tasks.map((t: any) => (
                  <div
                    key={t.id}
                    className="flex items-start gap-3 border rounded-lg p-3 text-sm"
                  >
                    <div className="mt-0.5">
                      {t.status === "completed" ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : t.status === "blocked" ? (
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      ) : (
                        <Clock className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{t.title}</span>
                        {priorityIcon(t.priority)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px]">{t.category.replace("_", " ")}</Badge>
                        <Badge variant="outline" className="text-[10px]">{t.assigneeRole}</Badge>
                        {t.dueDate && <span className="text-[10px] text-muted-foreground">Due: {t.dueDate}</span>}
                      </div>
                    </div>
                    <Badge variant={statusColor(t.status)} className="text-[10px]">{t.status}</Badge>
                  </div>
                ))}
                {tasks.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {tasksQuery.isLoading ? "Loading tasks..." : "No tasks found"}
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
