/**
 * PS List — Systems list with demand and assignment-facing visibility (real data from tRPC)
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ClipboardList, Loader2, Users, FolderOpen, UserCheck, Pencil, Check, X } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-600 border-green-500/30",
  draft: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  archived: "bg-gray-500/10 text-gray-500 border-gray-500/30",
};

const SYSTEM_TYPE_LABELS: Record<string, string> = {
  PROJECT_GOVERNANCE: "Project Governance",
  SOFTWARE_DELIVERY: "Software Delivery",
  SOFTWARE_LIFECYCLE: "Software Lifecycle",
  PROGRAM_MANAGEMENT: "Program Management",
  AGILE_PRODUCT: "Agile Product",
  AGILE_TEAM_DELIVERY: "Agile Team Delivery",
  OPERATIONS_IMPROVEMENT: "Operations Improvement",
};

function DemandBadge({ psSystemId }: { psSystemId: number }) {
  const { data: summary } = trpc.ps.demand.summary.useQuery(
    { psSystemId },
    { staleTime: 30_000 },
  );

  if (!summary || summary.totalRequests === 0) {
    return <Badge variant="outline" className="text-xs text-muted-foreground">No demand</Badge>;
  }

  return (
    <Badge variant="secondary" className="text-xs">
      <Users className="w-3 h-3 mr-1" />
      {summary.totalRequests} requests / {summary.totalQuantity} headcount
    </Badge>
  );
}

function AssignmentBadge({ psSystemId }: { psSystemId: number }) {
  const { data: summary } = trpc.ps.assignments.summary.useQuery(
    { psSystemId },
    { staleTime: 30_000 },
  );

  if (!summary || summary.totalRequests === 0) {
    return <span className="text-xs text-muted-foreground">--</span>;
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Badge variant="secondary" className="text-xs">
        <UserCheck className="w-3 h-3 mr-1" />
        {summary.totalAssignments} assigned
      </Badge>
      {summary.unfilledRequests > 0 && (
        <Badge className="text-xs bg-red-500/10 text-red-600 border-red-500/30">
          {summary.unfilledRequests} unfilled
        </Badge>
      )}
      {summary.partiallyFilledRequests > 0 && (
        <Badge className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
          {summary.partiallyFilledRequests} partial
        </Badge>
      )}
      {summary.filledRequests > 0 && (
        <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
          {summary.filledRequests} filled
        </Badge>
      )}
    </div>
  );
}

function InlineRename({ systemId, currentName }: { systemId: number; currentName: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentName);
  const [error, setError] = useState("");
  const utils = trpc.useUtils();

  const renameMutation = trpc.ps.systems.updateName.useMutation({
    onSuccess: () => {
      utils.ps.systems.list.invalidate();
      setEditing(false);
      setError("");
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleSave() {
    const trimmed = value.trim();
    if (!trimmed) { setError("Name cannot be empty"); return; }
    if (trimmed === currentName) { setEditing(false); return; }
    renameMutation.mutate({ id: systemId, name: trimmed });
  }

  function handleCancel() {
    setValue(currentName);
    setEditing(false);
    setError("");
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5 group">
        <span className="font-medium">{currentName}</span>
        <button
          type="button"
          onClick={() => { setValue(currentName); setEditing(true); setError(""); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
          title="Rename project"
        >
          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
          className="h-7 rounded border border-border bg-background px-2 text-sm w-48"
          autoFocus
          disabled={renameMutation.isPending}
        />
        <button type="button" onClick={handleSave} disabled={renameMutation.isPending}
          className="p-0.5 rounded hover:bg-green-500/10" title="Save">
          <Check className="w-4 h-4 text-green-600" />
        </button>
        <button type="button" onClick={handleCancel} disabled={renameMutation.isPending}
          className="p-0.5 rounded hover:bg-red-500/10" title="Cancel">
          <X className="w-4 h-4 text-red-500" />
        </button>
      </div>
      {error && <div className="text-xs text-red-500">{error}</div>}
    </div>
  );
}

export function PSListPage() {
  const { data: systems, isLoading } = trpc.ps.systems.list.useQuery();

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">PS Systems</h1>
        <Badge variant="secondary">{systems?.length ?? 0} systems</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ClipboardList className="w-4 h-4 text-indigo-500" />
            All Systems
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !systems || systems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FolderOpen className="w-10 h-10 mb-2" />
              <p className="text-sm">No systems yet. Use the PS Wizard to create one.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Name</th>
                    <th className="pb-2 font-medium text-muted-foreground">System Type</th>
                    <th className="pb-2 font-medium text-muted-foreground">Status</th>
                    <th className="pb-2 font-medium text-muted-foreground">Demand</th>
                    <th className="pb-2 font-medium text-muted-foreground">Assignments</th>
                  </tr>
                </thead>
                <tbody>
                  {systems.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5">
                        <InlineRename systemId={s.id} currentName={s.name} />
                      </td>
                      <td className="py-2.5">
                        <Badge variant="outline" className="text-xs">
                          {SYSTEM_TYPE_LABELS[s.systemType] || s.systemType}
                        </Badge>
                      </td>
                      <td className="py-2.5">
                        <Badge className={`text-xs ${STATUS_COLORS[s.status] || ""}`}>
                          {s.status}
                        </Badge>
                      </td>
                      <td className="py-2.5">
                        <DemandBadge psSystemId={s.id} />
                      </td>
                      <td className="py-2.5">
                        <AssignmentBadge psSystemId={s.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default PSListPage;
