/**
 * PMT Time Report — Filterable time entries with totals
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Clock } from "lucide-react";

export function PMTTimeReportPage({ workspaceId }: { workspaceId: number }) {
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: projects } = trpc.modules.pmt.projects.list.useQuery({ workspaceId });

  const queryInput: any = { workspaceId };
  if (projectFilter !== "all") queryInput.projectId = parseInt(projectFilter);
  if (startDate) queryInput.startDate = startDate;
  if (endDate) queryInput.endDate = endDate;

  const { data: entries, isLoading } = trpc.modules.pmt.timeEntries.list.useQuery(queryInput);

  const totalHours = useMemo(() => {
    if (!entries) return 0;
    return (entries as any[]).reduce((sum, e) => sum + (e.hours || 0), 0);
  }, [entries]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="h-6 w-6" />
          Time Report
        </h1>
      </div>

      {/* Filters */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">Project</Label>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects?.map((p: any) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
        </div>
        <Button variant="outline" size="sm" onClick={() => { setProjectFilter("all"); setStartDate(""); setEndDate(""); }}>
          Clear
        </Button>
      </div>

      {!entries || (entries as any[]).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No time entries found.
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Task</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>Comment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(entries as any[]).map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm">{new Date(e.spentOn).toLocaleDateString()}</TableCell>
                  <TableCell className="text-sm">User #{e.userId}</TableCell>
                  <TableCell className="text-sm">Project #{e.projectId}</TableCell>
                  <TableCell className="text-sm">{e.workItemId ? `Task #${e.workItemId}` : "—"}</TableCell>
                  <TableCell className="text-sm text-right font-medium">{e.hours.toFixed(1)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{e.comment || "—"}</TableCell>
                </TableRow>
              ))}
              {/* Totals */}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={4} className="text-sm">Total</TableCell>
                <TableCell className="text-sm text-right">{totalHours.toFixed(1)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
