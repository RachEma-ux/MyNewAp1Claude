/**
 * HR Offboarding Page — Offboarding cases with task checklists, KT items, exit interviews
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { UserMinus, CheckCircle2, Clock, AlertTriangle, BookOpen, MessageSquare } from "lucide-react";
import { Link } from "wouter";

const statusColor = (s: string) => {
  switch (s) {
    case "initiated": case "pending": return "outline";
    case "in_progress": return "default";
    case "completed": return "default";
    case "cancelled": return "destructive";
    case "skipped": return "secondary";
    case "blocked": return "destructive";
    case "scheduled": return "outline";
    default: return "outline";
  }
};

const reasonLabel = (r: string) => r.replace("_", " ");

export default function HROffboardingPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState("tasks");

  const casesQuery = trpc.hr.lifecycle.listOffboardingCases.useQuery({
    limit: 100,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });
  const caseDetailQuery = trpc.hr.lifecycle.getOffboardingCase.useQuery(
    { id: selectedCaseId! },
    { enabled: !!selectedCaseId }
  );
  const tasksQuery = trpc.hr.lifecycle.listOffboardingTasks.useQuery(
    { caseId: selectedCaseId! },
    { enabled: !!selectedCaseId }
  );
  const ktQuery = trpc.hr.lifecycle.listKnowledgeTransferItems.useQuery(
    { offboardingCaseId: selectedCaseId! },
    { enabled: !!selectedCaseId }
  );
  const exitQuery = trpc.hr.lifecycle.listExitInterviews.useQuery(
    { offboardingCaseId: selectedCaseId!, limit: 10 },
    { enabled: !!selectedCaseId }
  );

  const cases = casesQuery.data ?? [];
  const caseDetail = caseDetailQuery.data;
  const tasks = tasksQuery.data ?? [];
  const ktItems = ktQuery.data ?? [];
  const exitInterviews = exitQuery.data ?? [];

  const taskProgress = caseDetail
    ? caseDetail.totalTasks > 0
      ? Math.round((caseDetail.completedTasks / caseDetail.totalTasks) * 100)
      : 0
    : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Offboarding</h1>
          <p className="text-muted-foreground">Manage employee exit workflows</p>
        </div>
        <Link href="/hr">
          <Button variant="outline" size="sm">Back to HR</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="initiated">Initiated</SelectItem>
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
                <TableHead>Reason</TableHead>
                <TableHead>Last Working Date</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {casesQuery.isLoading ? "Loading..." : "No offboarding cases found"}
                  </TableCell>
                </TableRow>
              ) : (
                cases.map((c: any) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => { setSelectedCaseId(c.id); setDetailTab("tasks"); }}
                  >
                    <TableCell className="font-medium">#{c.id}</TableCell>
                    <TableCell>Worker #{c.workerId}</TableCell>
                    <TableCell><Badge variant="outline">{reasonLabel(c.reason)}</Badge></TableCell>
                    <TableCell>{c.lastWorkingDate || "—"}</TableCell>
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

      {/* Detail Panel */}
      <Sheet open={!!selectedCaseId} onOpenChange={(open) => !open && setSelectedCaseId(null)}>
        <SheetContent className="w-[500px] sm:w-[640px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Offboarding Case #{selectedCaseId}</SheetTitle>
          </SheetHeader>
          {caseDetail && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={statusColor(caseDetail.status)}>{caseDetail.status}</Badge></div>
                <div><span className="text-muted-foreground">Reason:</span> {reasonLabel(caseDetail.reason)}</div>
                <div><span className="text-muted-foreground">Last Working Date:</span> {caseDetail.lastWorkingDate || "—"}</div>
                <div><span className="text-muted-foreground">Progress:</span> {taskProgress}%</div>
              </div>
              <Progress value={taskProgress} className="h-2" />

              <Tabs value={detailTab} onValueChange={setDetailTab}>
                <TabsList className="w-full">
                  <TabsTrigger value="tasks" className="flex-1">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Tasks ({tasks.length})
                  </TabsTrigger>
                  <TabsTrigger value="kt" className="flex-1">
                    <BookOpen className="w-3 h-3 mr-1" /> KT ({ktItems.length})
                  </TabsTrigger>
                  <TabsTrigger value="exit" className="flex-1">
                    <MessageSquare className="w-3 h-3 mr-1" /> Exit ({exitInterviews.length})
                  </TabsTrigger>
                </TabsList>

                {/* Tasks */}
                <TabsContent value="tasks">
                  <div className="space-y-2">
                    {tasks.map((t: any) => (
                      <div key={t.id} className="flex items-start gap-3 border rounded-lg p-3 text-sm">
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
                          <span className="font-medium">{t.title}</span>
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
                      <p className="text-sm text-muted-foreground text-center py-4">No tasks</p>
                    )}
                  </div>
                </TabsContent>

                {/* Knowledge Transfer */}
                <TabsContent value="kt">
                  <div className="space-y-2">
                    {ktItems.map((kt: any) => (
                      <div key={kt.id} className="border rounded-lg p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{kt.title}</span>
                          <Badge variant={statusColor(kt.status)}>{kt.status}</Badge>
                        </div>
                        {kt.description && <p className="text-xs text-muted-foreground mt-1">{kt.description}</p>}
                        {kt.recipientWorkerId && (
                          <span className="text-xs text-muted-foreground">Recipient: Worker #{kt.recipientWorkerId}</span>
                        )}
                      </div>
                    ))}
                    {ktItems.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No knowledge transfer items</p>
                    )}
                  </div>
                </TabsContent>

                {/* Exit Interviews */}
                <TabsContent value="exit">
                  <div className="space-y-2">
                    {exitInterviews.map((ei: any) => (
                      <div key={ei.id} className="border rounded-lg p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Exit Interview #{ei.id}</span>
                          <Badge variant={statusColor(ei.status)}>{ei.status}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
                          <div>Scheduled: {ei.scheduledAt ? new Date(ei.scheduledAt).toLocaleDateString() : "—"}</div>
                          <div>Conducted: {ei.conductedAt ? new Date(ei.conductedAt).toLocaleDateString() : "—"}</div>
                          {ei.overallSatisfaction && <div>Satisfaction: {ei.overallSatisfaction}/5</div>}
                          {ei.wouldRecommend !== null && <div>Would Recommend: {ei.wouldRecommend ? "Yes" : "No"}</div>}
                          {ei.primaryReason && <div className="col-span-2">Reason: {ei.primaryReason}</div>}
                        </div>
                        {ei.feedback && <p className="text-xs mt-2 border-t pt-2">{ei.feedback}</p>}
                      </div>
                    ))}
                    {exitInterviews.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No exit interviews</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
