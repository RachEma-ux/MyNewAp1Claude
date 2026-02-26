/**
 * PMT Velocity Chart — SVG bar chart showing story points completed per sprint
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
import { Loader2, BarChart3 } from "lucide-react";

const CHART_W = 800;
const CHART_H = 400;
const PAD_T = 40;
const PAD_B = 80;
const PAD_L = 60;
const PAD_R = 30;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;
const BAR_GAP = 0.3; // fraction of slot width used as gap

export function PMTVelocityChart({ workspaceId }: { workspaceId: number }) {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);

  const { data: projects } = trpc.modules.pmt.projects.list.useQuery({ workspaceId });
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: sprints, isLoading } = trpc.modules.pmt.sprints.list.useQuery(
    { workspaceId, projectId: projectId! },
    { enabled: !!projectId }
  );

  const { data: tasks } = trpc.modules.pmt.tasks.list.useQuery(
    { workspaceId, projectId: projectId! },
    { enabled: !!projectId }
  );

  const chartData = useMemo(() => {
    if (!sprints || !tasks) return null;

    const closedSprints = sprints.filter((s: any) => s.status === "closed");
    if (closedSprints.length === 0) return null;

    const bars = closedSprints.map((sprint: any) => {
      const sprintTasks = tasks.filter(
        (t: any) => t.sprintId === sprint.id && t.status === "done"
      );
      const velocity = sprintTasks.reduce(
        (sum: number, t: any) => sum + (t.storyPoints || 0),
        0
      );
      return { name: sprint.name, velocity };
    });

    const maxVel = Math.max(...bars.map((b: any) => b.velocity), 1);

    // Y-axis labels
    const yStep = Math.max(1, Math.ceil(maxVel / 5));
    const yLabels: { y: number; label: string }[] = [];
    for (let v = 0; v <= maxVel; v += yStep) {
      yLabels.push({
        y: PAD_T + (1 - v / maxVel) * PLOT_H,
        label: String(v),
      });
    }

    const slotWidth = PLOT_W / bars.length;
    const barWidth = slotWidth * (1 - BAR_GAP);

    const barRects = bars.map((b: any, i: number) => ({
      x: PAD_L + i * slotWidth + (slotWidth - barWidth) / 2,
      y: PAD_T + (1 - b.velocity / maxVel) * PLOT_H,
      w: barWidth,
      h: (b.velocity / maxVel) * PLOT_H,
      label: b.name,
      value: b.velocity,
      cx: PAD_L + i * slotWidth + slotWidth / 2,
    }));

    const avgVelocity =
      bars.reduce((s: number, b: any) => s + b.velocity, 0) / bars.length;
    const avgY = PAD_T + (1 - avgVelocity / maxVel) * PLOT_H;

    return { barRects, yLabels, avgY, avgVelocity };
  }, [sprints, tasks]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          Velocity
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
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !chartData ? (
        <div className="text-center py-12 text-muted-foreground">
          No closed sprints yet. Complete a sprint to see velocity data.
        </div>
      ) : (
        <div className="border rounded-lg p-4 bg-background overflow-x-auto">
          <svg width={CHART_W} height={CHART_H} className="mx-auto">
            {/* Grid lines */}
            {chartData.yLabels.map((yl, i) => (
              <line
                key={`grid-${i}`}
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

            {/* Bars */}
            {chartData.barRects.map((bar, i) => (
              <g key={`bar-${i}`}>
                <rect
                  x={bar.x}
                  y={bar.y}
                  width={bar.w}
                  height={bar.h}
                  rx={4}
                  fill="#3b82f6"
                  opacity={0.8}
                />
                {/* Value on top */}
                <text
                  x={bar.cx}
                  y={bar.y - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                  fontWeight="bold"
                >
                  {bar.value}
                </text>
                {/* Sprint name below */}
                <text
                  x={bar.cx}
                  y={PAD_T + PLOT_H + 18}
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                  opacity={0.6}
                >
                  {bar.label.length > 12 ? bar.label.slice(0, 12) + "…" : bar.label}
                </text>
              </g>
            ))}

            {/* Average velocity line */}
            <line
              x1={PAD_L}
              y1={chartData.avgY}
              x2={PAD_L + PLOT_W}
              y2={chartData.avgY}
              stroke="#f97316"
              strokeWidth={1.5}
              strokeDasharray="6 3"
            />
            <text
              x={PAD_L + PLOT_W + 5}
              y={chartData.avgY + 4}
              fontSize={10}
              fill="#f97316"
            >
              Avg: {chartData.avgVelocity.toFixed(1)}
            </text>

            {/* Axis labels */}
            <text x={PAD_L + PLOT_W / 2} y={CHART_H - 5} textAnchor="middle" fontSize={12} fill="currentColor" opacity={0.5}>
              Sprints
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
