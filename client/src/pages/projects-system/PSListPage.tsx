/**
 * PS List — Systems list with demand counts (real data from tRPC)
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ClipboardList, Loader2, Users, FolderOpen } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-600 border-green-500/30",
  draft: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  archived: "bg-gray-500/10 text-gray-500 border-gray-500/30",
};

const SYSTEM_TYPE_LABELS: Record<string, string> = {
  PROJECT_GOVERNANCE: "Project Governance",
  SOFTWARE_DELIVERY: "Software Delivery",
  PROGRAM_MANAGEMENT: "Program Management",
  AGILE_PRODUCT: "Agile Product",
  OPERATIONS_IMPROVEMENT: "Operations Improvement",
};

function DemandBadge({ workspaceId, psSystemId }: { workspaceId: number; psSystemId: number }) {
  const { data: summary } = trpc.ps.demand.summary.useQuery(
    { workspaceId, psSystemId },
    { staleTime: 30_000 },
  );

  if (!summary || summary.totalRequests === 0) {
    return <Badge variant="outline" className="text-xs text-muted-foreground">No demand</Badge>;
  }

  const open = summary.byStatus.draft + summary.byStatus.open;
  const filled = summary.byStatus.filled;
  const partial = summary.byStatus.partially_filled;

  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="secondary" className="text-xs">
        <Users className="w-3 h-3 mr-1" />
        {summary.totalQuantity} headcount
      </Badge>
      {open > 0 && (
        <Badge className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
          {open} open
        </Badge>
      )}
      {partial > 0 && (
        <Badge className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/30">
          {partial} partial
        </Badge>
      )}
      {filled > 0 && (
        <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
          {filled} filled
        </Badge>
      )}
    </div>
  );
}

export function PSListPage({ workspaceId }: { workspaceId: number }) {
  const { data: systems, isLoading } = trpc.ps.systems.list.useQuery({ workspaceId });

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
                  </tr>
                </thead>
                <tbody>
                  {systems.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 font-medium">{s.name}</td>
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
                        <DemandBadge workspaceId={workspaceId} psSystemId={s.id} />
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
