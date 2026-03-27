/**
 * PMT Gantt Chart — Pure SVG timeline with dependency arrows
 */

import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ZoomIn, ZoomOut, Calendar } from "lucide-react";

const typeColors: Record<string, string> = {
  task: "#3b82f6",
  bug: "#ef4444",
  story: "#22c55e",
  epic: "#a855f7",
  milestone: "#f97316",
  feature: "#06b6d4",
};

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 48;
const SIDEBAR_WIDTH = 200;
const MIN_PX_PER_DAY = 4;
const MAX_PX_PER_DAY = 40;

function daysBetween(a: Date, b: Date) {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatMonthYear(d: Date) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function PMTGanttPage() {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [pxPerDay, setPxPerDay] = useState(14);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: projects } = trpc.modules.pmt.projects.list.useQuery();
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: tasks, isLoading } = trpc.modules.pmt.tasks.list.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  const { data: dependencies } = trpc.modules.pmt.dependencies.list.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  const timeline = useMemo(() => {
    if (!tasks || tasks.length === 0) return null;

    const tasksWithDates = tasks.filter((t: any) => t.startDate || t.dueDate);
    if (tasksWithDates.length === 0) return null;

    let minDate = new Date();
    let maxDate = new Date();
    let first = true;

    for (const t of tasksWithDates) {
      const start = t.startDate ? new Date(t.startDate) : null;
      const end = t.dueDate ? new Date(t.dueDate) : null;
      const d = start || end!;
      const e = end || start!;
      if (first) {
        minDate = new Date(d);
        maxDate = new Date(e);
        first = false;
      } else {
        if (d < minDate) minDate = new Date(d);
        if (e > maxDate) maxDate = new Date(e);
      }
    }

    // Add padding: 7 days before and after
    minDate.setDate(minDate.getDate() - 7);
    maxDate.setDate(maxDate.getDate() + 7);

    const totalDays = daysBetween(minDate, maxDate);
    const totalWidth = totalDays * pxPerDay;

    return { minDate, maxDate, totalDays, totalWidth };
  }, [tasks, pxPerDay]);

  const taskPositions = useMemo(() => {
    if (!tasks || !timeline) return new Map();
    const map = new Map<number, { x: number; w: number; y: number }>();

    tasks.forEach((t: any, i: number) => {
      const start = t.startDate ? new Date(t.startDate) : t.dueDate ? new Date(t.dueDate) : null;
      const end = t.dueDate ? new Date(t.dueDate) : t.startDate ? new Date(t.startDate) : null;
      if (!start || !end) return;

      const x = daysBetween(timeline.minDate, start) * pxPerDay;
      const w = Math.max(daysBetween(start, end) * pxPerDay, pxPerDay);
      const y = HEADER_HEIGHT + i * ROW_HEIGHT;
      map.set(t.id, { x, w, y });
    });

    return map;
  }, [tasks, timeline, pxPerDay]);

  // Generate date labels for header
  const dateLabels = useMemo(() => {
    if (!timeline) return [];
    const labels: { x: number; label: string; isMonth: boolean }[] = [];
    const d = new Date(timeline.minDate);

    for (let i = 0; i <= timeline.totalDays; i++) {
      const x = i * pxPerDay;
      if (pxPerDay >= 20) {
        // Show every day
        labels.push({ x, label: formatDate(d), isMonth: d.getDate() === 1 });
      } else if (pxPerDay >= 10) {
        // Show every 7 days
        if (i % 7 === 0) {
          labels.push({ x, label: formatDate(d), isMonth: d.getDate() <= 7 });
        }
      } else {
        // Show monthly
        if (d.getDate() === 1 || i === 0) {
          labels.push({ x, label: formatMonthYear(d), isMonth: true });
        }
      }
      d.setDate(d.getDate() + 1);
    }

    return labels;
  }, [timeline, pxPerDay]);

  // Today marker position
  const todayX = useMemo(() => {
    if (!timeline) return null;
    const today = new Date();
    if (today < timeline.minDate || today > timeline.maxDate) return null;
    return daysBetween(timeline.minDate, today) * pxPerDay;
  }, [timeline, pxPerDay]);

  const zoomIn = () => setPxPerDay((p) => Math.min(p * 1.5, MAX_PX_PER_DAY));
  const zoomOut = () => setPxPerDay((p) => Math.max(p / 1.5, MIN_PX_PER_DAY));

  const scrollToToday = () => {
    if (todayX != null && scrollRef.current) {
      scrollRef.current.scrollLeft = todayX - scrollRef.current.clientWidth / 2;
    }
  };

  const svgHeight = tasks ? HEADER_HEIGHT + tasks.length * ROW_HEIGHT + 20 : 200;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calendar className="h-6 w-6" />
          Gantt Chart
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={zoomOut} title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={zoomIn} title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={scrollToToday} title="Scroll to today">
            Today
          </Button>
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

      {!projectId ? (
        <div className="text-center py-12 text-muted-foreground">
          No projects available. Create a project first.
        </div>
      ) : !tasks || tasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No work items found. Create tasks with start/due dates to see the Gantt chart.
        </div>
      ) : !timeline ? (
        <div className="text-center py-12 text-muted-foreground">
          No tasks with dates found. Set start or due dates on your tasks.
        </div>
      ) : (
        <div className="border rounded-md flex overflow-hidden bg-background">
          {/* Sidebar — task names */}
          <div
            className="flex-shrink-0 border-r bg-muted/30"
            style={{ width: SIDEBAR_WIDTH }}
          >
            <div
              className="px-3 font-semibold text-xs text-muted-foreground flex items-center border-b"
              style={{ height: HEADER_HEIGHT }}
            >
              Task
            </div>
            {tasks.map((t: any, i: number) => (
              <div
                key={t.id}
                className="px-3 flex items-center text-sm truncate border-b border-border/50 hover:bg-muted/50"
                style={{ height: ROW_HEIGHT }}
                title={t.title}
              >
                <span
                  className="w-2 h-2 rounded-full mr-2 flex-shrink-0"
                  style={{ backgroundColor: typeColors[t.type || "task"] || typeColors.task }}
                />
                <span className="truncate">{t.title}</span>
              </div>
            ))}
          </div>

          {/* Timeline SVG area */}
          <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden">
            <svg
              width={timeline.totalWidth}
              height={svgHeight}
              className="select-none"
            >
              {/* Background row stripes */}
              {tasks.map((_: any, i: number) => (
                <rect
                  key={`row-${i}`}
                  x={0}
                  y={HEADER_HEIGHT + i * ROW_HEIGHT}
                  width={timeline.totalWidth}
                  height={ROW_HEIGHT}
                  fill={i % 2 === 0 ? "transparent" : "rgba(128,128,128,0.05)"}
                />
              ))}

              {/* Vertical grid lines at date labels */}
              {dateLabels.map((dl, i) => (
                <line
                  key={`grid-${i}`}
                  x1={dl.x}
                  y1={HEADER_HEIGHT}
                  x2={dl.x}
                  y2={svgHeight}
                  stroke={dl.isMonth ? "rgba(128,128,128,0.3)" : "rgba(128,128,128,0.1)"}
                  strokeWidth={dl.isMonth ? 1 : 0.5}
                />
              ))}

              {/* Header date labels */}
              {dateLabels.map((dl, i) => (
                <text
                  key={`label-${i}`}
                  x={dl.x + 4}
                  y={HEADER_HEIGHT - 8}
                  fontSize={10}
                  fill="currentColor"
                  className="text-muted-foreground"
                  opacity={0.7}
                >
                  {dl.label}
                </text>
              ))}

              {/* Header bottom border */}
              <line
                x1={0}
                y1={HEADER_HEIGHT}
                x2={timeline.totalWidth}
                y2={HEADER_HEIGHT}
                stroke="rgba(128,128,128,0.3)"
                strokeWidth={1}
              />

              {/* Task bars */}
              {tasks.map((t: any) => {
                const pos = taskPositions.get(t.id);
                if (!pos) return null;
                const color = typeColors[t.type || "task"] || typeColors.task;
                const pct = (t.percentComplete ?? 0) / 100;
                const barY = pos.y + 6;
                const barH = ROW_HEIGHT - 12;

                return (
                  <g key={`bar-${t.id}`}>
                    {/* Background bar */}
                    <rect
                      x={pos.x}
                      y={barY}
                      width={pos.w}
                      height={barH}
                      rx={3}
                      fill={color}
                      opacity={0.3}
                    />
                    {/* Progress fill */}
                    {pct > 0 && (
                      <rect
                        x={pos.x}
                        y={barY}
                        width={pos.w * pct}
                        height={barH}
                        rx={3}
                        fill={color}
                        opacity={0.8}
                      />
                    )}
                    {/* Border */}
                    <rect
                      x={pos.x}
                      y={barY}
                      width={pos.w}
                      height={barH}
                      rx={3}
                      fill="none"
                      stroke={color}
                      strokeWidth={1}
                    />
                    {/* Title on bar if wide enough */}
                    {pos.w > 60 && (
                      <text
                        x={pos.x + 6}
                        y={barY + barH / 2 + 4}
                        fontSize={10}
                        fill="white"
                        className="pointer-events-none"
                      >
                        {t.title.length > pos.w / 7 ? t.title.slice(0, Math.floor(pos.w / 7)) + "…" : t.title}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Dependency arrows */}
              {dependencies &&
                dependencies.map((dep: any, i: number) => {
                  const from = taskPositions.get(dep.taskId);
                  const to = taskPositions.get(dep.dependsOnTaskId);
                  if (!from || !to) return null;

                  const startX = from.x + from.w;
                  const startY = from.y + ROW_HEIGHT / 2;
                  const endX = to.x;
                  const endY = to.y + ROW_HEIGHT / 2;
                  const midX = (startX + endX) / 2;

                  return (
                    <g key={`dep-${i}`}>
                      <path
                        d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
                        fill="none"
                        stroke="rgba(128,128,128,0.5)"
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                      />
                      {/* Arrow head */}
                      <polygon
                        points={`${endX},${endY} ${endX - 6},${endY - 3} ${endX - 6},${endY + 3}`}
                        fill="rgba(128,128,128,0.5)"
                      />
                    </g>
                  );
                })}

              {/* Today marker */}
              {todayX != null && (
                <g>
                  <line
                    x1={todayX}
                    y1={0}
                    x2={todayX}
                    y2={svgHeight}
                    stroke="#ef4444"
                    strokeWidth={2}
                    opacity={0.7}
                  />
                  <text
                    x={todayX + 4}
                    y={12}
                    fontSize={10}
                    fill="#ef4444"
                    fontWeight="bold"
                  >
                    Today
                  </text>
                </g>
              )}
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
