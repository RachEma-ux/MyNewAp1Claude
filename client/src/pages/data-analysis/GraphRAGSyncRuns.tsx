import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw } from "lucide-react";

function statusBadge(status: string) {
  const variant =
    status === "completed"
      ? "default"
      : status === "running"
        ? "secondary"
        : status === "failed"
          ? "destructive"
          : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

export function GraphRAGSyncRuns() {
  const { data: runs, isLoading } =
    trpc.dataAnalysis.graphRag.listSyncRuns.useQuery({});

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="py-12 text-center">
          <RefreshCw className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">No sync runs yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Trigger a sync from the Datasets tab to export module data.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-sm">Sync Run History</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Dataset</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Documents</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell className="font-mono text-xs">{run.id}</TableCell>
                <TableCell>
                  <Badge variant="outline">{run.moduleSlug}</Badge>
                </TableCell>
                <TableCell className="text-xs">{run.datasetKey}</TableCell>
                <TableCell>{statusBadge(run.status)}</TableCell>
                <TableCell>{run.documentCount ?? 0}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {run.startedAt
                    ? new Date(run.startedAt).toLocaleString()
                    : "-"}
                </TableCell>
                <TableCell className="text-xs text-destructive max-w-xs truncate">
                  {run.errorMessage || "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
