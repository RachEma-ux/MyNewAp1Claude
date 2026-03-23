/**
 * HR Training & Learning Page — Training catalog, assignments, and history
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
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { BookOpen, GraduationCap, History, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

const statusVariant = (s: string) => {
  switch (s) {
    case "assigned": return "outline" as const;
    case "in_progress": return "default" as const;
    case "completed": return "default" as const;
    case "overdue": return "destructive" as const;
    case "waived": return "secondary" as const;
    default: return "outline" as const;
  }
};

export default function HRTrainingPage() {
  const [tab, setTab] = useState("catalog");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState("all");

  const summaryQuery = trpc.hr.learning.summary.useQuery();
  const catalogQuery = trpc.hr.learning.listTraining.useQuery({
    limit: 100,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
  });
  const assignmentsQuery = trpc.hr.learning.listAssignments.useQuery({
    limit: 100,
    status: assignmentStatusFilter !== "all" ? assignmentStatusFilter : undefined,
  });
  const historyQuery = trpc.hr.learning.listHistory.useQuery({ limit: 100 });

  const summary = summaryQuery.data ?? { totalTraining: 0, activeAssignments: 0, overdueAssignments: 0, expiringCerts: 0 };
  const catalog = catalogQuery.data ?? [];
  const assignments = assignmentsQuery.data ?? [];
  const history = historyQuery.data ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Training & Learning</h1>
          <p className="text-muted-foreground">Training catalog, assignments, and learning history</p>
        </div>
        <Link href="/hr">
          <Button variant="outline" size="sm">Back to HR</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Courses</div>
            <div className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> {summary.totalTraining}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Active Assignments</div>
            <div className="text-2xl font-bold flex items-center gap-2">
              <GraduationCap className="w-4 h-4" /> {summary.activeAssignments}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Overdue</div>
            <div className="text-2xl font-bold text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {summary.overdueAssignments}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Expiring Certs (90d)</div>
            <div className="text-2xl font-bold">{summary.expiringCerts}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="space-y-3">
          <div className="flex gap-3">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="technical">Technical</SelectItem>
                <SelectItem value="compliance">Compliance</SelectItem>
                <SelectItem value="leadership">Leadership</SelectItem>
                <SelectItem value="safety">Safety</SelectItem>
                <SelectItem value="soft_skills">Soft Skills</SelectItem>
                <SelectItem value="onboarding">Onboarding</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Mandatory</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {catalog.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        {catalogQuery.isLoading ? "Loading..." : "No training courses found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    catalog.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.title}</TableCell>
                        <TableCell><Badge variant="outline">{c.category || "—"}</Badge></TableCell>
                        <TableCell>{c.format}</TableCell>
                        <TableCell>{c.durationHours ? `${c.durationHours}h` : "—"}</TableCell>
                        <TableCell>{c.isMandatory ? <Badge variant="destructive">Required</Badge> : "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments" className="space-y-3">
          <div className="flex gap-3">
            <Select value={assignmentStatusFilter} onValueChange={setAssignmentStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="waived">Waived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Worker</TableHead>
                    <TableHead>Training</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        {assignmentsQuery.isLoading ? "Loading..." : "No learning assignments found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    assignments.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell>Worker #{a.workerId}</TableCell>
                        <TableCell>Training #{a.trainingId}</TableCell>
                        <TableCell>{a.dueDate || "—"}</TableCell>
                        <TableCell>{a.score !== null ? `${a.score}%` : "—"}</TableCell>
                        <TableCell><Badge variant={statusVariant(a.status)}>{a.status.replace("_", " ")}</Badge></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Worker</TableHead>
                    <TableHead>Training</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Valid Until</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        {historyQuery.isLoading ? "Loading..." : "No learning history found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    history.map((h: any) => (
                      <TableRow key={h.id}>
                        <TableCell>Worker #{h.workerId}</TableCell>
                        <TableCell>{h.trainingTitle}</TableCell>
                        <TableCell>{h.completedAt ? new Date(h.completedAt).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>{h.score !== null ? `${h.score}%` : "—"}</TableCell>
                        <TableCell>{h.validUntil || "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
