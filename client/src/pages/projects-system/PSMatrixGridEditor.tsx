/**
 * PSMatrixGridEditor — Grid tab
 *
 * Interactive matrix grid: questions × scopes with weight editing.
 * Read-only for active versions.
 */
import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { PSVersionSelector } from "./PSControlPanelPage";

export function PSMatrixGridEditor({
  workspaceId,
  selectedVersionId,
  onSelectVersion,
}: {
  workspaceId: number;
  selectedVersionId: number | null;
  onSelectVersion: (id: number) => void;
}) {
  const utils = trpc.useUtils();
  const { data: grid, isLoading } = trpc.ps.matrix.getGrid.useQuery(
    { workspaceId, versionId: selectedVersionId! },
    { enabled: !!selectedVersionId },
  );

  const isDraft = grid?.version?.status === "draft";
  const [pendingChanges, setPendingChanges] = useState<Map<string, number>>(new Map());

  const upsertMut = trpc.ps.matrix.bulkUpsertCells.useMutation({
    onSuccess: () => {
      utils.ps.matrix.getGrid.invalidate();
      utils.ps.matrix.getOverview.invalidate();
      setPendingChanges(new Map());
      toast.success("Grid saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const cellMap = useMemo(() => {
    const m = new Map<string, number>();
    if (grid?.cells) {
      for (const c of grid.cells) {
        m.set(`${c.questionId}-${c.scopeId}`, c.weight);
      }
    }
    return m;
  }, [grid]);

  const getWeight = useCallback((qId: number, sId: number): number => {
    const key = `${qId}-${sId}`;
    if (pendingChanges.has(key)) return pendingChanges.get(key)!;
    return cellMap.get(key) ?? 0;
  }, [cellMap, pendingChanges]);

  const setWeight = useCallback((qId: number, sId: number, val: string) => {
    const key = `${qId}-${sId}`;
    const num = parseInt(val, 10);
    setPendingChanges((prev) => {
      const next = new Map(prev);
      if (isNaN(num)) next.delete(key);
      else next.set(key, num);
      return next;
    });
  }, []);

  const handleSave = () => {
    if (!selectedVersionId || pendingChanges.size === 0) return;
    const items = Array.from(pendingChanges.entries()).map(([key, weight]) => {
      const [qId, sId] = key.split("-").map(Number);
      return { questionId: qId, scopeId: sId, weight };
    });
    upsertMut.mutate({ workspaceId, versionId: selectedVersionId, items });
  };

  const activeScopes = grid?.scopes?.filter((s) => s.isActive === 1) ?? [];
  const activeQuestions = grid?.questions?.filter((q) => q.isActive === 1) ?? [];

  return (
    <div className="space-y-4">
      <PSVersionSelector workspaceId={workspaceId} selectedVersionId={selectedVersionId} onSelectVersion={onSelectVersion} />
      {!selectedVersionId ? null : isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Matrix Grid
              <span className="text-sm font-normal text-muted-foreground ml-2">
                {activeQuestions.length} questions x {activeScopes.length} scopes
              </span>
            </h2>
            {isDraft && (
              <Button onClick={handleSave} disabled={pendingChanges.size === 0 || upsertMut.isPending} size="sm">
                {upsertMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Save ({pendingChanges.size} changes)
              </Button>
            )}
          </div>
          {!isDraft && <p className="text-xs text-yellow-600">Read-only: only draft versions can be edited.</p>}

          {activeScopes.length === 0 || activeQuestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {activeScopes.length === 0 ? "No active scopes." : "No active questions."} Add them in the Scopes/Questions tabs.
            </p>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">Question</TableHead>
                      {activeScopes.map((s) => (
                        <TableHead key={s.id} className="text-center min-w-[80px] text-xs">
                          <div className="truncate max-w-[80px]" title={s.label}>{s.code}</div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeQuestions.map((q) => (
                      <TableRow key={q.id}>
                        <TableCell className="sticky left-0 bg-background z-10 text-xs font-medium" title={q.label}>
                          <div className="truncate max-w-[200px]">{q.code}: {q.label}</div>
                        </TableCell>
                        {activeScopes.map((s) => {
                          const w = getWeight(q.id, s.id);
                          const key = `${q.id}-${s.id}`;
                          const isChanged = pendingChanges.has(key);
                          return (
                            <TableCell key={s.id} className="p-0.5 text-center">
                              <Input
                                type="number"
                                value={w}
                                onChange={(e) => setWeight(q.id, s.id, e.target.value)}
                                disabled={!isDraft}
                                className={`h-7 w-16 text-center text-xs mx-auto ${isChanged ? "ring-1 ring-blue-500" : ""} ${w === 0 ? "text-muted-foreground" : "font-medium"}`}
                              />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          )}
        </>
      )}
    </div>
  );
}
