import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Bot, Activity } from "lucide-react";

export default function AgentOrchestrationPanel() {
  const { data, isLoading, error } = trpc.hq.agentOrchestration.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive text-center py-12">
        Failed to load agents: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agent Orchestration</h1>
        <p className="text-muted-foreground mt-1">
          Agent inventory, status, and promotion lifecycle
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.total ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.activeCount ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(data?.total ?? 0) - (data?.activeCount ?? 0)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agent Inventory</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.agents && data.agents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Name</th>
                    <th className="text-left py-2 px-3 font-medium">Type</th>
                    <th className="text-left py-2 px-3 font-medium">Status</th>
                    <th className="text-left py-2 px-3 font-medium">Promotion</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agents.map((a: any) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-2 px-3 font-medium">{a.name}</td>
                      <td className="py-2 px-3"><Badge variant="outline">{a.type}</Badge></td>
                      <td className="py-2 px-3">
                        <Badge variant={a.status === "active" ? "default" : "secondary"}>
                          {a.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-3">
                        <Badge variant="outline">{a.promotionState}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No agents registered</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
