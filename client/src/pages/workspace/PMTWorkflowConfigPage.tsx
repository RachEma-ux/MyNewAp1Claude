/**
 * PMT Workflow Configuration — Manage status transitions per type
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
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
import { Loader2, Workflow, Plus, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export function PMTWorkflowConfigPage({ workspaceId }: { workspaceId: number }) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [newTypeId, setNewTypeId] = useState<string>("");
  const [newFromId, setNewFromId] = useState<string>("");
  const [newToId, setNewToId] = useState<string>("");

  const utils = trpc.useUtils();

  const { data: types } = trpc.modules.pmt.config.types.list.useQuery({ workspaceId });
  const { data: statuses } = trpc.modules.pmt.config.statuses.list.useQuery({ workspaceId });
  const { data: workflows, isLoading } = trpc.modules.pmt.config.workflows.list.useQuery({ workspaceId });

  const createMut = trpc.modules.pmt.config.workflows.create.useMutation({
    onSuccess: () => {
      utils.modules.pmt.config.workflows.list.invalidate();
      setNewTypeId("");
      setNewFromId("");
      setNewToId("");
      toast.success("Transition added");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.modules.pmt.config.workflows.delete.useMutation({
    onSuccess: () => {
      utils.modules.pmt.config.workflows.list.invalidate();
      toast.success("Transition deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const typeMap = new Map((types || []).map((t: any) => [t.id, t.name]));
  const statusMap = new Map((statuses || []).map((s: any) => [s.id, s.name]));

  const filtered = workflows
    ? typeFilter === "all"
      ? workflows
      : workflows.filter((w: any) => String(w.typeId) === typeFilter)
    : [];

  const handleAdd = () => {
    if (!newTypeId || !newFromId || !newToId) {
      toast.error("Select type, from status, and to status");
      return;
    }
    if (newFromId === newToId) {
      toast.error("From and To status must be different");
      return;
    }
    createMut.mutate({
      workspaceId,
      typeId: parseInt(newTypeId),
      fromStatusId: parseInt(newFromId),
      toStatusId: parseInt(newToId),
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Delete this transition?")) {
      deleteMut.mutate({ id, workspaceId });
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Workflow className="h-6 w-6" />
          Workflow Transitions
        </h1>
      </div>

      {/* Filter by type */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Filter by type:</span>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {(types || []).map((t: any) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Add new transition */}
      <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/30">
        <Select value={newTypeId} onValueChange={setNewTypeId}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            {(types || []).map((t: any) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={newFromId} onValueChange={setNewFromId}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="From status" />
          </SelectTrigger>
          <SelectContent>
            {(statuses || []).map((s: any) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <Select value={newToId} onValueChange={setNewToId}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="To status" />
          </SelectTrigger>
          <SelectContent>
            {(statuses || []).map((s: any) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={handleAdd} disabled={createMut.isPending}>
          {createMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Transitions table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No workflow transitions configured. Add transitions above.
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>From Status</TableHead>
                <TableHead className="w-10" />
                <TableHead>To Status</TableHead>
                <TableHead className="w-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((w: any) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">{typeMap.get(w.typeId) || `Type #${w.typeId}`}</TableCell>
                  <TableCell>{statusMap.get(w.fromStatusId) || `Status #${w.fromStatusId}`}</TableCell>
                  <TableCell>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </TableCell>
                  <TableCell>{statusMap.get(w.toStatusId) || `Status #${w.toStatusId}`}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDelete(w.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
