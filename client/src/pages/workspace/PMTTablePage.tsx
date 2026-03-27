/**
 * PMT Table View — Sortable, filterable table of work items
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Loader2, TableProperties, ArrowUpDown, X } from "lucide-react";
import { toast } from "sonner";
import { PMTTaskDetailDrawer } from "./PMTTaskDetailDrawer";

const typeColors: Record<string, string> = {
  task: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  bug: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  story: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  epic: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  milestone: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  feature: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
};

const priorityColors: Record<string, string> = {
  low: "text-green-500",
  medium: "text-yellow-500",
  high: "text-orange-500",
  critical: "text-red-500",
};

const STATUSES = ["backlog", "todo", "in_progress", "review", "done"];
const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};
const TYPES = ["task", "bug", "story", "epic", "milestone"];
const PRIORITIES = ["low", "medium", "high", "critical"];

type SortKey = "title" | "type" | "status" | "priority" | "dueDate" | "percentComplete";

export function PMTTablePage() {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortAsc, setSortAsc] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: projects } = trpc.modules.pmt.projects.list.useQuery();
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: allTasks, isLoading } = trpc.modules.pmt.tasks.list.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  const updateMut = trpc.modules.pmt.tasks.update.useMutation({
    onSuccess: () => {
      utils.modules.pmt.tasks.list.invalidate();
      utils.modules.pmt.tasks.get.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.modules.pmt.tasks.delete.useMutation({
    onSuccess: () => {
      utils.modules.pmt.tasks.list.invalidate();
      setSelected(new Set());
      toast.success("Deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  // Filter + sort
  const filtered = useMemo(() => {
    let result = allTasks || [];
    if (statusFilter !== "all") result = result.filter((t) => t.status === statusFilter);
    if (typeFilter !== "all") result = result.filter((t) => t.type === typeFilter);
    if (priorityFilter !== "all") result = result.filter((t) => t.priority === priorityFilter);

    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "type":
          cmp = (a.type || "").localeCompare(b.type || "");
          break;
        case "status":
          cmp = STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status);
          break;
        case "priority":
          cmp = (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
          break;
        case "dueDate":
          cmp = (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) -
                (b.dueDate ? new Date(b.dueDate).getTime() : Infinity);
          break;
        case "percentComplete":
          cmp = (a.percentComplete ?? 0) - (b.percentComplete ?? 0);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [allTasks, statusFilter, typeFilter, priorityFilter, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((t) => t.id)));
  };

  const hasFilters = statusFilter !== "all" || typeFilter !== "all" || priorityFilter !== "all";

  const bulkChangeStatus = (status: string) => {
    selected.forEach((id) => updateMut.mutate({ id, status }));
    setSelected(new Set());
    toast.success("Status updated");
  };

  const bulkDelete = () => {
    selected.forEach((id) => deleteMut.mutate({ id }));
  };

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <TableHead
      className="cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => toggleSort(k)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
        {sortKey === k && <span className="text-[10px]">{sortAsc ? "A" : "D"}</span>}
      </span>
    </TableHead>
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TableProperties className="h-6 w-6" />
          Table View
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

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter("all");
              setTypeFilter("all");
              setPriorityFilter("all");
            }}
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 bg-muted p-2 rounded-md">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Select onValueChange={bulkChangeStatus}>
            <SelectTrigger className="w-36 h-7 text-xs">
              <SelectValue placeholder="Change Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="destructive" size="sm" onClick={bulkDelete}>
            Delete Selected
          </Button>
        </div>
      )}

      {/* Table */}
      {!projectId ? (
        <div className="text-center py-12 text-muted-foreground">
          No projects available. Create a project first.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No work items found. Create your first task.
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <SortHeader label="Title" k="title" />
                <SortHeader label="Type" k="type" />
                <SortHeader label="Status" k="status" />
                <SortHeader label="Priority" k="priority" />
                <TableHead>Assignee</TableHead>
                <SortHeader label="Due Date" k="dueDate" />
                <SortHeader label="% Done" k="percentComplete" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((task) => (
                <TableRow
                  key={task.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(task.id)}
                      onCheckedChange={() => toggleSelect(task.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{task.title}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] ${typeColors[task.type || "task"] || typeColors.task}`}>
                      {task.type || "task"}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={task.status}
                      onValueChange={(v) =>
                        updateMut.mutate({ id: task.id, status: v })
                      }
                    >
                      <SelectTrigger className="h-7 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={task.priority}
                      onValueChange={(v) =>
                        updateMut.mutate({ id: task.id, priority: v })
                      }
                    >
                      <SelectTrigger className={`h-7 w-24 text-xs ${priorityColors[task.priority] || ""}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs">
                    {task.assigneeType === "ai" ? "AI" : task.assigneeId ? `User #${task.assigneeId}` : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{task.percentComplete ?? 0}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Task Detail Drawer */}
      <PMTTaskDetailDrawer
        taskId={selectedTaskId}
        open={!!selectedTaskId}
        onOpenChange={(open) => { if (!open) setSelectedTaskId(null); }}
      />
    </div>
  );
}
