import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users } from "lucide-react";

export default function CodeStudioAgentsPage() {
  const agentsQuery = trpc.codeStudio.agents.list.useQuery();
  const agents = agentsQuery.data ?? [];

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Users className="h-4 w-4 text-violet-500" /> Agent Roles
        {agents.length > 0 && <Badge variant="secondary" className="text-[9px] px-1.5">{agents.length}</Badge>}
      </h2>

      {agentsQuery.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>}
      {!agentsQuery.isLoading && agents.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-8">No agents configured.</p>
      )}
      <div className="space-y-2">
        {agents.map((a: any) => (
          <Card key={a.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{a.name}</span>
                  <Badge variant={a.mode === "primary" ? "default" : "outline"} className="text-[9px]">{a.mode}</Badge>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">{a.id}</span>
              </div>
              {a.description && <p className="text-[10px] text-muted-foreground mt-1">{a.description}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
