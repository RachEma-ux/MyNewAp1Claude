/**
 * PMT Reporting Dashboard — Status distribution, workload, overdue, type breakdown
 */

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, BarChart3, AlertTriangle } from "lucide-react";
import { useState } from "react";

const STATUS_COLORS: Record<string, string> = {
  backlog: "#64748b",
  todo: "#3b82f6",
  in_progress: "#eab308",
  review: "#a855f7",
  done: "#22c55e",
};

const TYPE_COLORS: Record<string, string> = {
  task: "#3b82f6",
  bug: "#ef4444",
  story: "#22c55e",
  epic: "#a855f7",
  milestone: "#f97316",
  feature: "#06b6d4",
};

function DonutChart({ data, colors, size = 160 }: { data: { label: string; value: number }[]; colors: Record<string, string>; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="text-sm text-muted-foreground text-center py-4">No data</div>;
  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;
  let cumAngle = -Math.PI / 2;

  return (
    <svg width={size} height={size} className="mx-auto">
      {data.filter(d => d.value > 0).map((d) => {
        const angle = (d.value / total) * 2 * Math.PI;
        const startX = cx + r * Math.cos(cumAngle);
        const startY = cy + r * Math.sin(cumAngle);
        cumAngle += angle;
        const endX = cx + r * Math.cos(cumAngle);
        const endY = cy + r * Math.sin(cumAngle);
        const large = angle > Math.PI ? 1 : 0;
        return (
          <path
            key={d.label}
            d={`M ${cx} ${cy} L ${startX} ${startY} A ${r} ${r} 0 ${large} 1 ${endX} ${endY} Z`}
            fill={colors[d.label] || "#94a3b8"}
            stroke="white"
            strokeWidth={2}
          />
        );
      })}
      <circle cx={cx} cy={cy} r={r * 0.55} fill="var(--background, white)" />
      <text x={cx} y={cy} textAnchor="middle" dy="0.35em" fontSize={20} fontWeight="bold" fill="currentColor">
        {total}
      </text>
    </svg>
  );
}

export function PMTReportingPage() {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);

  const { data: projects } = trpc.modules.pmt.projects.list.useQuery();
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: tasks, isLoading } = trpc.modules.pmt.tasks.list.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  const statusData = useMemo(() => {
    if (!tasks) return [];
    const counts: Record<string, number> = {};
    for (const t of tasks as any[]) {
      const s = t.status || "backlog";
      counts[s] = (counts[s] || 0) + 1;
    }
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [tasks]);

  const typeData = useMemo(() => {
    if (!tasks) return [];
    const counts: Record<string, number> = {};
    for (const t of tasks as any[]) {
      const tp = t.type || "task";
      counts[tp] = (counts[tp] || 0) + 1;
    }
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [tasks]);

  const overdue = useMemo(() => {
    if (!tasks) return [];
    const now = new Date();
    return (tasks as any[]).filter(t => t.dueDate && new Date(t.dueDate) < now && t.status !== "done");
  }, [tasks]);

  const workload = useMemo(() => {
    if (!tasks) return [];
    const counts: Record<string, number> = {};
    for (const t of tasks as any[]) {
      const assignee = t.assigneeType === "ai" ? "AI Agent" : t.assigneeId ? `User #${t.assigneeId}` : "Unassigned";
      counts[assignee] = (counts[assignee] || 0) + 1;
    }
    return Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [tasks]);

  const maxWorkload = Math.max(...workload.map(w => w.value), 1);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          Reporting
        </h1>
        {projects && projects.length > 0 && (
          <Select value={String(projectId || "")} onValueChange={(v) => setSelectedProject(parseInt(v))}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p: any) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {(
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Status Distribution */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChart data={statusData} colors={STATUS_COLORS} />
              <div className="flex flex-wrap gap-2 mt-3 justify-center">
                {statusData.map(d => (
                  <div key={d.label} className="flex items-center gap-1 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[d.label] || "#94a3b8" }} />
                    {d.label} ({d.value})
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Overdue */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Overdue Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-destructive mb-3">{overdue.length}</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {overdue.slice(0, 5).map((t: any) => (
                  <div key={t.id} className="text-xs flex items-center justify-between">
                    <span className="truncate">{t.title}</span>
                    <Badge variant="destructive" className="text-[9px]">
                      {new Date(t.dueDate).toLocaleDateString()}
                    </Badge>
                  </div>
                ))}
                {overdue.length > 5 && <div className="text-xs text-muted-foreground">+{overdue.length - 5} more</div>}
              </div>
            </CardContent>
          </Card>

          {/* Workload */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Workload by Assignee</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {workload.map(w => (
                  <div key={w.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>{w.label}</span>
                      <span>{w.value}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(w.value / maxWorkload) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Type Breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Type Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChart data={typeData} colors={TYPE_COLORS} />
              <div className="flex flex-wrap gap-2 mt-3 justify-center">
                {typeData.map(d => (
                  <div key={d.label} className="flex items-center gap-1 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[d.label] || "#94a3b8" }} />
                    {d.label} ({d.value})
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
