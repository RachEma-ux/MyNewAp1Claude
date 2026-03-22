import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

export default function ActionItemsPanel({ projectId }: { projectId: number }) {
  const query = trpc.modules.pmt.shell.tools.actionItems.list.useQuery({ projectId });
  const items = query.data ?? [];


  const open = items.filter((a: any) => a.status !== "done" && a.status !== "cancelled");
  const done = items.filter((a: any) => a.status === "done" || a.status === "cancelled");

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Action Items</h2>
      <p className="text-sm text-muted-foreground">Meeting outputs, follow-ups, and assigned actions</p>
      {items.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <ListChecks className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No action items yet.</p>
        </CardContent></Card>
      ) : (
        <>
          {open.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Open ({open.length})</h3>
              {open.map((item: any) => (
                <Card key={item.id}>
                  <CardContent className="py-3 flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                        <span className="capitalize">{item.source}</span>
                        {item.dueDate && <span>Due: {new Date(item.dueDate).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <Badge variant={item.priority === "high" ? "destructive" : "outline"} className="text-[10px]">{item.status}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {done.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Done ({done.length})</h3>
              {done.map((item: any) => (
                <Card key={item.id} className="opacity-60">
                  <CardContent className="py-2 flex items-center justify-between">
                    <span className="text-sm line-through">{item.title}</span>
                    <Badge variant="secondary" className="text-[10px]">{item.status}</Badge>
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
