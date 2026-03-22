import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export default function BudgetPanel({ projectId }: { projectId: number }) {
  const query = trpc.modules.pmt.shell.tools.budget.list.useQuery({ projectId });
  const items = query.data ?? [];


  const totalPlanned = items.reduce((sum: number, i: any) => sum + (i.planned || 0), 0);
  const totalActual = items.reduce((sum: number, i: any) => sum + (i.actual || 0), 0);
  const variance = totalPlanned - totalActual;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Budget</h2>
      <p className="text-sm text-muted-foreground">Planned vs actual cost tracking by category</p>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Planned</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">${(totalPlanned / 100).toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Actual</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">${(totalActual / 100).toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Variance</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${variance >= 0 ? "text-green-500" : "text-red-500"}`}>
              {variance >= 0 ? "+" : ""}${(variance / 100).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {items.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <DollarSign className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No budget items. Add line items for planned and actual costs.</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-2">
              {items.map((item: any) => {
                const v = (item.planned || 0) - (item.actual || 0);
                return (
                  <div key={item.id} className="flex items-center justify-between p-2 rounded border text-sm">
                    <div>
                      <span className="font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground ml-2 capitalize">{item.category}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span>Plan: ${(item.planned / 100).toLocaleString()}</span>
                      <span>Act: ${(item.actual / 100).toLocaleString()}</span>
                      <span className={v >= 0 ? "text-green-500" : "text-red-500"}>{v >= 0 ? "+" : ""}${(v / 100).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
