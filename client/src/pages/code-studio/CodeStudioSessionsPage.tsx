import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Terminal, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function CodeStudioSessionsPage() {
  const sessionsQuery = trpc.codeStudio.sessions.list.useQuery({});
  const sessions = sessionsQuery.data ?? [];
  const openIdeMutation = trpc.codeStudio.ide.openForSession.useMutation({
    onSuccess: (data) => {
      if (data?.proxyUrl) {
        window.open(data.proxyUrl, "_blank");
        toast.success(data.isReused ? "Reusing existing IDE session" : "OpenCode Web launched");
      }
    },
    onError: (e) => toast.error(`IDE launch failed: ${e.message}`),
  });

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Terminal className="h-4 w-4 text-teal-500" /> Sessions
        {sessions.length > 0 && <Badge variant="secondary" className="text-[9px] px-1.5">{sessions.length}</Badge>}
      </h2>

      {sessionsQuery.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>}
      {!sessionsQuery.isLoading && sessions.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-8">No sessions yet. Sessions are created when jobs execute.</p>
      )}
      <div className="space-y-2">
        {sessions.map((s: any) => (
          <Card key={s.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono">#{s.id}</span>
                  {s.agentRole && <Badge variant="secondary" className="text-[9px]">{s.agentRole}</Badge>}
                  {s.model && <span className="text-muted-foreground">{s.model}</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" className="text-[9px] h-5 px-1.5"
                    onClick={() => openIdeMutation.mutate({ sessionId: s.id })}
                    disabled={openIdeMutation.isPending} title="Open in OpenCode Web">
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                  <Badge variant="outline" className="text-[9px] capitalize">{s.status}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1 text-[9px] text-muted-foreground">
                <span>Job #{s.jobId}</span>
                {s.opencodeSessionId && <span className="font-mono truncate max-w-[150px]">OC: {s.opencodeSessionId}</span>}
                {s.createdAt && <span>{new Date(s.createdAt).toLocaleString()}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
