import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

const COLUMNS = [
  { key: "todo", label: "To Do", color: "border-t-gray-400" },
  { key: "in_progress", label: "In Progress", color: "border-t-blue-500" },
  { key: "review", label: "Review", color: "border-t-yellow-500" },
  { key: "done", label: "Done", color: "border-t-green-500" },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-red-500", high: "text-orange-500", medium: "text-yellow-500", low: "text-gray-400",
};

export default function TaskBoardPanel({ projectId }: { projectId: number }) {
  const tasksQuery = trpc.modules.pmt.shell.tasks.list.useQuery({ projectId });
  const allTasks = tasksQuery.data ?? [];


  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Task Board</h2>
      <div className="grid grid-cols-4 gap-3 min-h-[400px]">
        {COLUMNS.map(col => {
          const colTasks = allTasks.filter((t: any) => t.status === col.key);
          return (
            <div key={col.key} className={`bg-muted/30 rounded-lg border-t-2 ${col.color} p-2 space-y-2`}>
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold">{col.label}</span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1">{colTasks.length}</Badge>
              </div>
              {colTasks.map((task: any) => (
                <Card key={task.id} className="shadow-sm">
                  <CardContent className="p-2.5">
                    <p className="text-xs font-medium leading-tight">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {task.priority && (
                        <span className={`text-[10px] font-medium ${PRIORITY_COLORS[task.priority] || ""}`}>
                          {task.priority}
                        </span>
                      )}
                      {task.dueDate && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(task.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {colTasks.length === 0 && (
                <div className="text-[10px] text-muted-foreground text-center py-6">No tasks</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
