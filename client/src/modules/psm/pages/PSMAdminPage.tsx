import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Shield, Package, CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export default function PSMAdminPage() {
  const packsQuery = trpc.psm.admin.contentPacks.useQuery();
  const qualityQuery = trpc.psm.admin.quality.report.useQuery();
  const jobsQuery = trpc.psm.jobs.list.useQuery();

  const packs = packsQuery.data ?? [];
  const quality = qualityQuery.data;
  const jobs = jobsQuery.data ?? [];

  const publishMutation = trpc.psm.admin.content.publish.useMutation({
    onSuccess: () => { toast.success("Content published"); packsQuery.refetch(); },
    onError: () => toast.error("Publish failed"),
  });

  const rollbackMutation = trpc.psm.admin.content.rollback.useMutation({
    onSuccess: () => { toast.success("Content rolled back"); packsQuery.refetch(); },
    onError: () => toast.error("Rollback failed"),
  });

  const statusColor = (s: string) => {
    switch (s) {
      case "published": return "text-green-500 border-green-500/30";
      case "committed": return "text-blue-500 border-blue-500/30";
      case "rolled_back": return "text-red-500 border-red-500/30";
      case "preview": return "text-amber-500 border-amber-500/30";
      default: return "";
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Shield className="h-4 w-4 text-teal-500" /> Admin Console
      </h2>

      {/* Quality summary */}
      {quality && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold">{quality.methodCount ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Methods</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold">{quality.caseCount ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Cases</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold">{quality.activeRunCount ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Active Runs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold">{quality.contentPackCount ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Content Packs</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Content Packs */}
      <div>
        <h3 className="text-xs font-semibold mb-2 flex items-center gap-2">
          <Package className="h-3.5 w-3.5" /> Content Packs
        </h3>
        <ScrollArea className="h-[calc(100vh-22rem)]">
          {packsQuery.isLoading && (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
          )}
          {!packsQuery.isLoading && packs.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No content packs.</p>
          )}
          <div className="space-y-2 pr-2">
            {packs.map((pack: any) => (
              <Card key={pack.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">{pack.name || `Pack #${pack.id}`}</p>
                      {pack.description && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{pack.description}</p>
                      )}
                      <p className="text-[9px] text-muted-foreground mt-0.5">v{pack.version || "1.0"}</p>
                    </div>
                    <Badge variant="outline" className={`text-[9px] capitalize shrink-0 ml-2 ${statusColor(pack.status)}`}>
                      {pack.status}
                    </Badge>
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    {pack.status === "committed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-6"
                        disabled={publishMutation.isPending}
                        onClick={() => publishMutation.mutate({ packId: pack.id, reason: "Admin publish" })}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Publish
                      </Button>
                    )}
                    {pack.status === "published" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-6 text-red-500"
                        disabled={rollbackMutation.isPending}
                        onClick={() => rollbackMutation.mutate({ packId: pack.id, reason: "Admin rollback" })}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" /> Rollback
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Import Jobs */}
      {jobs.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold mb-2">Recent Import Jobs</h3>
          <div className="space-y-1">
            {jobs.map((job: any) => (
              <div key={job.id} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-muted/50">
                <span>Job #{job.id}</span>
                <Badge variant="outline" className="text-[9px] capitalize">{job.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
