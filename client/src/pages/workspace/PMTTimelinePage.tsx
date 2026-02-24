/**
 * PMT Timeline — Project timeline view (Gantt-style list)
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, Clock } from "lucide-react";
import { useState } from "react";

export function PMTTimelinePage({ workspaceId }: { workspaceId: number }) {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);

  const { data: projects } = trpc.modules.pmt.projects.list.useQuery({ workspaceId });
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: tasks } = trpc.modules.pmt.tasks.list.useQuery(
    { workspaceId, projectId: projectId! },
    { enabled: !!projectId }
  );

  const sorted = [...(tasks || [])].sort((a, b) => {
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return da - db;
  });

  const fmt = (d: string | Date | null | undefined) => {
    if (!d) return "No date";
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarDays className="h-6 w-6" />
          Timeline
        </h1>
        {projects && projects.length > 0 && (
          <Select
            value={String(projectId || "")}
            onValueChange={(v) => setSelectedProject(parseInt(v))}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!projectId ? (
        <div className="text-center py-12 text-muted-foreground">
          No projects available.
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No tasks in this project yet.
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

          <div className="space-y-3 pl-10">
            {sorted.map((task) => {
              const overdue =
                task.dueDate &&
                task.status !== "done" &&
                new Date(task.dueDate) < new Date();

              return (
                <div key={task.id} className="relative">
                  {/* Dot on timeline */}
                  <div
                    className={`absolute -left-[26px] top-3 h-3 w-3 rounded-full border-2 border-background ${
                      task.status === "done"
                        ? "bg-green-500"
                        : overdue
                        ? "bg-red-500"
                        : "bg-blue-500"
                    }`}
                  />

                  <Card>
                    <CardContent className="py-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{task.title}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{fmt(task.dueDate)}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {task.status || "backlog"}
                          </Badge>
                          {task.priority && (
                            <Badge variant="outline" className="text-[10px]">
                              {task.priority}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {overdue && (
                        <Badge variant="destructive" className="text-[10px]">
                          Overdue
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
