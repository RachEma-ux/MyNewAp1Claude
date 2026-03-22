import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

const SEV_COLORS: Record<string, string> = { critical: "bg-red-500", high: "bg-orange-500", medium: "bg-yellow-500", low: "bg-gray-400" };

export default function IssuesPanel({ projectId }: { projectId: number }) {
  const query = trpc.modules.pmt.shell.tools.issues.list.useQuery({ projectId });
  const issues = query.data ?? [];


  const open = issues.filter((i: any) => i.status !== "closed" && i.status !== "resolved");
  const resolved = issues.filter((i: any) => i.status === "closed" || i.status === "resolved");

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Issues</h2>
      <p className="text-sm text-muted-foreground">Current problems requiring resolution</p>
      {issues.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No issues reported.</p>
        </CardContent></Card>
      ) : (
        <>
          {open.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Open ({open.length})</h3>
              {open.map((issue: any) => (
                <Card key={issue.id}>
                  <CardContent className="py-3 flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium">{issue.title}</p>
                      {issue.description && <p className="text-xs text-muted-foreground mt-0.5">{issue.description}</p>}
                      {issue.dueDate && <span className="text-[10px] text-muted-foreground">Due: {new Date(issue.dueDate).toLocaleDateString()}</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge className={`${SEV_COLORS[issue.severity] || "bg-gray-400"} text-white text-[10px]`}>{issue.severity}</Badge>
                      <Badge variant="outline" className="text-[10px]">{issue.status}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {resolved.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Resolved ({resolved.length})</h3>
              {resolved.map((issue: any) => (
                <Card key={issue.id} className="opacity-60">
                  <CardContent className="py-2 flex items-center justify-between">
                    <span className="text-sm">{issue.title}</span>
                    <Badge variant="secondary" className="text-[10px]">{issue.status}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
