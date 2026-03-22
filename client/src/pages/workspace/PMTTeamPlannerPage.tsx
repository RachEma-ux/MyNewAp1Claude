/**
 * PMT Team Planner — Grid layout: rows = assignees, columns = days
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Users, ChevronLeft, ChevronRight } from "lucide-react";

const typeColors: Record<string, string> = {
  task: "bg-blue-500",
  bug: "bg-red-500",
  story: "bg-green-500",
  epic: "bg-purple-500",
  milestone: "bg-orange-500",
  feature: "bg-cyan-500",
};

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); // Monday start
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDay(d: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${days[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isDateInRange(date: Date, start: Date | null, end: Date | null): boolean {
  const dk = dateKey(date);
  if (start && end) return dk >= dateKey(start) && dk <= dateKey(end);
  if (start) return dk === dateKey(start);
  if (end) return dk === dateKey(end);
  return false;
}

export function PMTTeamPlannerPage({ workspaceId }: { workspaceId: number }) {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const { data: projects } = trpc.modules.pmt.projects.list.useQuery({ workspaceId });
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: tasks, isLoading } = trpc.modules.pmt.tasks.list.useQuery(
    { workspaceId, projectId: projectId! },
    { enabled: !!projectId }
  );

  const weekStart = useMemo(() => {
    const base = getWeekStart(new Date());
    base.setDate(base.getDate() + weekOffset * 7);
    return base;
  }, [weekOffset]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const plannerData = useMemo(() => {
    if (!tasks) return { assignees: [], grid: new Map() };

    // Collect unique assignees
    const assigneeSet = new Map<string, string>(); // key -> label
    for (const t of tasks) {
      const key = t.assigneeId ? `user-${t.assigneeId}` : t.assigneeType === "ai" ? "ai" : "unassigned";
      const label = t.assigneeId
        ? `User #${t.assigneeId}`
        : t.assigneeType === "ai"
        ? "AI Agent"
        : "Unassigned";
      assigneeSet.set(key, label);
    }

    const assignees = Array.from(assigneeSet.entries()).map(([key, label]) => ({ key, label }));

    // Build grid: assigneeKey -> dayKey -> tasks[]
    const grid = new Map<string, Map<string, any[]>>();
    for (const a of assignees) {
      grid.set(a.key, new Map());
    }

    for (const task of tasks) {
      const aKey = task.assigneeId
        ? `user-${task.assigneeId}`
        : task.assigneeType === "ai"
        ? "ai"
        : "unassigned";

      const start = task.startDate ? new Date(task.startDate) : null;
      const end = task.dueDate ? new Date(task.dueDate) : null;

      for (const day of days) {
        if (isDateInRange(day, start, end)) {
          const dk = dateKey(day);
          const row = grid.get(aKey);
          if (row) {
            if (!row.has(dk)) row.set(dk, []);
            row.get(dk)!.push(task);
          }
        }
      }
    }

    return { assignees, grid };
  }, [tasks, days]);

  const today = dateKey(new Date());

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          Team Planner
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>
            This Week
          </Button>
          <Button variant="outline" size="icon" onClick={() => setWeekOffset((w) => w + 1)}>
            <ChevronRight className="h-4 w-4" />
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

      {plannerData.assignees.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No tasks with assignees or dates found.
        </div>
      ) : (
        <div className="border rounded-lg overflow-auto">
          <table className="w-full border-collapse min-w-[900px]">
            <thead>
              <tr>
                <th className="border-b border-r bg-muted/30 px-3 py-2 text-left text-sm font-medium w-36">
                  Team Member
                </th>
                {days.map((day) => {
                  const dk = dateKey(day);
                  const isToday = dk === today;
                  return (
                    <th
                      key={dk}
                      className={`border-b border-r px-2 py-2 text-center text-xs font-medium ${
                        isToday ? "bg-blue-50 dark:bg-blue-950/30" : "bg-muted/30"
                      }`}
                    >
                      {formatDay(day)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {plannerData.assignees.map((assignee) => (
                <tr key={assignee.key}>
                  <td className="border-b border-r px-3 py-2 text-sm font-medium whitespace-nowrap">
                    {assignee.label}
                  </td>
                  {days.map((day) => {
                    const dk = dateKey(day);
                    const isToday = dk === today;
                    const cellTasks = plannerData.grid.get(assignee.key)?.get(dk) || [];
                    return (
                      <td
                        key={dk}
                        className={`border-b border-r px-1 py-1 align-top ${
                          isToday ? "bg-blue-50/50 dark:bg-blue-950/10" : ""
                        }`}
                      >
                        <div className="space-y-0.5">
                          {cellTasks.map((task: any) => (
                            <div
                              key={task.id}
                              className={`text-[10px] text-white px-1.5 py-0.5 rounded truncate ${
                                typeColors[task.type || "task"] || typeColors.task
                              }`}
                              title={task.title}
                            >
                              {task.title}
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
