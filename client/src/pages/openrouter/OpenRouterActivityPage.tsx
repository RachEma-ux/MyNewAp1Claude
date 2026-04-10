import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity } from "lucide-react";

export default function OpenRouterActivityPage() {
  const activity = trpc.openRouter.activity.list.useQuery({ limit: 100 });

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <h3 className="text-lg font-semibold">Activity Log</h3>
      <p className="text-sm text-muted-foreground">Operational events: sync, config changes, routing updates, executions</p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!activity.data || activity.data.length === 0) && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No activity yet</TableCell></TableRow>
              )}
              {(activity.data ?? []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell><Badge variant="outline" className="text-[10px]">{a.action}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-96 truncate">{a.details ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
