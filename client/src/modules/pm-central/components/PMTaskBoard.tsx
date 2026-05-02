/**
 * PMTaskBoard — column grouping of tasks by status for a project.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COLUMNS: Array<{ key: string; label: string }> = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "blocked", label: "Blocked" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];

export function PMTaskBoard({ pmProjectId }: { pmProjectId: number }) {
  const { data, isLoading, error } =
    trpc.pmCentral.tasks.listByProject.useQuery({ pmProjectId });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error)
    return (
      <p className="text-sm text-destructive">Failed to load: {error.message}</p>
    );
  const tasks = data ?? [];
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
      {COLUMNS.map((col) => {
        const filtered = tasks.filter((t) => t.status === col.key);
        return (
          <Card key={col.key}>
            <CardHeader>
              <CardTitle className="text-sm">
                {col.label} ({filtered.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground">empty</p>
              ) : (
                filtered.map((t) => (
                  <div
                    key={t.id}
                    className="rounded border p-2 text-sm"
                  >
                    <div className="font-medium">{t.title}</div>
                    <div className="text-xs text-muted-foreground">
                      priority: {t.priority}
                      {t.assigneeUserId
                        ? ` · assignee #${t.assigneeUserId}`
                        : ""}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
