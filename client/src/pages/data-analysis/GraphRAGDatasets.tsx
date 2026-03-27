import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, Play } from "lucide-react";
import { toast } from "sonner";

export function GraphRAGDatasets() {
  const utils = trpc.useUtils();
  const { data: sources, isLoading } =
    trpc.dataAnalysis.graphRag.listSources.useQuery();

  const syncMut = trpc.dataAnalysis.graphRag.syncSource.useMutation({
    onSuccess: (data) => {
      utils.dataAnalysis.graphRag.listSyncRuns.invalidate();
      utils.dataAnalysis.graphRag.listSources.invalidate();
      if (data.status === "completed") {
        toast.success(`Sync completed: ${data.documentCount} documents exported`);
      } else {
        toast.error(`Sync failed: ${data.error}`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const buildMut = trpc.dataAnalysis.graphRag.buildIndex.useMutation({
    onSuccess: (data) => {
      utils.dataAnalysis.graphRag.listIndexRuns.invalidate();
      if (data.status === "completed") {
        toast.success("Index build completed");
      } else {
        toast.error(`Index build failed: ${data.error}`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!sources || sources.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No datasets registered yet. Source adapters register datasets at application startup.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            The Documents pilot adapter is initialized automatically when the server starts.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-sm">Registered Datasets</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Module</TableHead>
              <TableHead>Dataset</TableHead>
              <TableHead>Display Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Sync</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((src) => (
              <TableRow key={src.id}>
                <TableCell>
                  <Badge variant="outline">{src.moduleSlug}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {src.datasetKey}
                </TableCell>
                <TableCell>{src.displayName}</TableCell>
                <TableCell>
                  <Badge variant={src.enabled ? "default" : "secondary"}>
                    {src.enabled ? "Active" : "Disabled"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {src.lastSyncAt
                    ? new Date(src.lastSyncAt).toLocaleString()
                    : "Never"}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => syncMut.mutate({ sourceId: src.id })}
                    disabled={syncMut.isPending}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Sync
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => buildMut.mutate({ sourceId: src.id })}
                    disabled={buildMut.isPending}
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Build Index
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
