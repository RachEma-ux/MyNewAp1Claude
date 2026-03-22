import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-500", in_progress: "bg-blue-500", submitted: "bg-yellow-500",
  accepted: "bg-green-500", rejected: "bg-red-500", rework: "bg-orange-500",
};

export default function DeliverablesPanel({ projectId }: { projectId: number }) {
  const query = trpc.modules.pmt.shell.tools.deliverables.list.useQuery({ projectId });
  const items = query.data ?? [];


  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Deliverables</h2>
      {items.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No deliverables tracked yet.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((d: any) => (
            <Card key={d.id}>
              <CardContent className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{d.name}</p>
                  {d.description && <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>}
                  {d.dueDate && <span className="text-[10px] text-muted-foreground">Due: {new Date(d.dueDate).toLocaleDateString()}</span>}
                </div>
                <Badge className={`${STATUS_COLORS[d.status] || "bg-gray-500"} text-white text-[10px]`}>
                  {d.status.replace("_", " ")}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
