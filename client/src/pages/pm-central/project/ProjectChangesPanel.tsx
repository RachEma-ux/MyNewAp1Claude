import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, GitBranch } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500", submitted: "bg-blue-500", under_review: "bg-yellow-500",
  approved: "bg-green-500", rejected: "bg-red-500", implemented: "bg-emerald-500",
};

export default function ProjectChangesPanel({ projectId }: { projectId: number }) {
  const query = trpc.modules.pmt.shell.changes.list.useQuery({ projectId });
  const changes = query.data ?? [];

  if (query.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Change Requests</h2>
      <p className="text-sm text-muted-foreground">Scope, schedule, budget, and technical changes with G2 gate review</p>
      {changes.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <GitBranch className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No change requests.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {changes.map((cr: any) => (
            <Card key={cr.id}>
              <CardContent className="py-3 flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium">{cr.title}</p>
                  {cr.description && <p className="text-xs text-muted-foreground mt-0.5">{cr.description}</p>}
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                    <span className="capitalize">{cr.changeType}</span>
                    <span>Impact: {cr.impact}</span>
                  </div>
                </div>
                <Badge className={`${STATUS_COLORS[cr.status] || "bg-gray-500"} text-white text-[10px]`}>
                  {cr.status.replace("_", " ")}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
