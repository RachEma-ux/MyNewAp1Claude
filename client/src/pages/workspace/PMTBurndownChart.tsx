/**
 * PMT Burndown Chart — SVG line chart showing sprint progress vs ideal
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, TrendingDown } from "lucide-react";

const CHART_W = 800;
const CHART_H = 400;
const PAD_T = 40;
const PAD_B = 60;
const PAD_L = 60;
const PAD_R = 30;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

function daysBetween(a: Date, b: Date) {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function PMTBurndownChart({ workspaceId }: { workspaceId: number }) {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);

  const { data: projects } = trpc.modules.pmt.projects.list.useQuery({ workspaceId });
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: sprints } = trpc.modules.pmt.sprints.list.useQuery(
    { workspaceId, projectId: projectId! },
    { enabled: !!projectId }
  );

  const activeSprint = selectedSprintId
    ? sprints?.find((s: any) => s.id === selectedSprintId)
    : sprints?.find((s: any) => s.status === "active") || sprints?.[0];

  const { data: burndown, isLoading } = trpc.modules.pmt.sprints.burndown.useQuery(
    { workspaceId, sprintId: activeSprint?.id! },
    { enabled: !!activeSprint?.id }
  );

  const chartData = useMemo(() => {
    if (!activeSprint || !burndown) return null;

    const startDate = new Date(activeSprint.startDate);
    const endDate = new Date(activeSprint.endDate);
    const totalDays = daysBetween(startDate, endDate);
    if (totalDays <= 0) return null;

    const totalPoints = (burndown as any).totalPoints ?? 0;
    if (totalPoints <= 0) return null;

    // Ideal line: straight from totalPoints to 0
    const idealLine: { x: number; y: number }[] = [];
    for (let d = 0; d <= totalDays; d++) {
      idealLine.push({
        x: PAD_L + (d / totalDays) * PLOT_W,
        y: PAD_T + (1 - (totalPoints - (totalPoints * d) / totalDays) / totalPoints) * PLOT_H,
      });
    }

    // Actual line from burndown data
    const dailyData = (burndown as any).daily || [];
    const actualLine: { x: number; y: number }[] = dailyData.map((entry: any) => {
      const entryDate = new Date(entry.date);
      const dayIndex = daysBetween(startDate, entryDate);
      return {
        x: PAD_L + (dayIndex / totalDays) * PLOT_W,
        y: PAD_T + (1 - entry.remaining / totalPoints) * PLOT_H,
      };
    });

    // Date labels for x-axis
    const xLabels: { x: number; label: string }[] = [];
    const labelStep = Math.max(1, Math.floor(totalDays / 8));
    for (let d = 0; d <= totalDays; d += labelStep) {
      const dt = new Date(startDate);
      dt.setDate(dt.getDate() + d);
      xLabels.push({
        x: PAD_L + (d / totalDays) * PLOT_W,
        label: `${dt.getMonth() + 1}/${dt.getDate()}`,
      });
    }

    // Y-axis labels
    const yLabels: { y: number; label: string }[] = [];
    const yStep = Math.max(1, Math.ceil(totalPoints / 5));
    for (let p = 0; p <= totalPoints; p += yStep) {
      yLabels.push({
        y: PAD_T + (1 - p / totalPoints) * PLOT_H,
        label: String(p),
      });
    }

    return { idealLine, actualLine, xLabels, yLabels, totalPoints, totalDays };
  }, [activeSprint, burndown]);

  const toPath = (points: { x: number; y: number }[]) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingDown className="h-6 w-6" />
          Burndown Chart
        </h1>
        <div className="flex items-center gap-2">
          {projects && projects.length > 0 && (
            <Select
              value={String(projectId || "")}
              onValueChange={(v) => setSelectedProject(parseInt(v))}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {sprints && sprints.length > 0 && (
            <Select
              value={String(activeSprint?.id || "")}
              onValueChange={(v) => setSelectedSprintId(parseInt(v))}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select sprint" />
              </SelectTrigger>
              <SelectContent>
                {sprints.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name} ({s.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !activeSprint ? (
        <div className="text-center py-12 text-muted-foreground">
          No sprint selected. Create a sprint to see the burndown chart.
        </div>
      ) : !chartData ? (
        <div className="text-center py-12 text-muted-foreground">
          No burndown data available for this sprint.
        </div>
      ) : (
        <div className="border rounded-lg p-4 bg-background overflow-x-auto">
          <svg width={CHART_W} height={CHART_H} className="mx-auto">
            {/* Grid lines */}
            {chartData.yLabels.map((yl, i) => (
              <line
                key={`grid-y-${i}`}
                x1={PAD_L}
                y1={yl.y}
                x2={PAD_L + PLOT_W}
                y2={yl.y}
                stroke="rgba(128,128,128,0.15)"
                strokeWidth={1}
              />
            ))}

            {/* Axes */}
            <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + PLOT_H} stroke="currentColor" opacity={0.3} />
            <line x1={PAD_L} y1={PAD_T + PLOT_H} x2={PAD_L + PLOT_W} y2={PAD_T + PLOT_H} stroke="currentColor" opacity={0.3} />

            {/* Y labels */}
            {chartData.yLabels.map((yl, i) => (
              <text key={`yl-${i}`} x={PAD_L - 8} y={yl.y + 4} textAnchor="end" fontSize={11} fill="currentColor" opacity={0.6}>
                {yl.label}
              </text>
            ))}

            {/* X labels */}
            {chartData.xLabels.map((xl, i) => (
              <text key={`xl-${i}`} x={xl.x} y={PAD_T + PLOT_H + 20} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.6}>
                {xl.label}
              </text>
            ))}

            {/* Ideal line */}
            <path d={toPath(chartData.idealLine)} fill="none" stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 3" />

            {/* Actual line */}
            {chartData.actualLine.length > 0 && (
              <path d={toPath(chartData.actualLine)} fill="none" stroke="#3b82f6" strokeWidth={2.5} />
            )}

            {/* Actual dots */}
            {chartData.actualLine.map((pt, i) => (
              <circle key={`dot-${i}`} cx={pt.x} cy={pt.y} r={3} fill="#3b82f6" />
            ))}

            {/* Legend */}
            <line x1={PAD_L + 10} y1={16} x2={PAD_L + 30} y2={16} stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 3" />
            <text x={PAD_L + 35} y={20} fontSize={11} fill="currentColor" opacity={0.7}>Ideal</text>

            <line x1={PAD_L + 90} y1={16} x2={PAD_L + 110} y2={16} stroke="#3b82f6" strokeWidth={2.5} />
            <text x={PAD_L + 115} y={20} fontSize={11} fill="currentColor" opacity={0.7}>Actual</text>

            {/* Axis labels */}
            <text x={PAD_L + PLOT_W / 2} y={CHART_H - 5} textAnchor="middle" fontSize={12} fill="currentColor" opacity={0.5}>
              Sprint Days
            </text>
            <text x={15} y={PAD_T + PLOT_H / 2} textAnchor="middle" fontSize={12} fill="currentColor" opacity={0.5} transform={`rotate(-90, 15, ${PAD_T + PLOT_H / 2})`}>
              Story Points
            </text>
          </svg>
        </div>
      )}
    </div>
  );
}
