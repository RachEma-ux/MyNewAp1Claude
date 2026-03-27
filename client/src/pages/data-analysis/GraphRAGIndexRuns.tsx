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
import { Loader2, Layers } from "lucide-react";

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

export function GraphRAGIndexRuns() {
  const { data: runs, isLoading } =
    trpc.dataAnalysis.graphRag.listIndexRuns.useQuery({});

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
          <Layers className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">No index runs yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Build an index from the Datasets tab after syncing data.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-sm">Index Run History</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Run Key</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Entities</TableHead>
              <TableHead>Relationships</TableHead>
              <TableHead>Communities</TableHead>
              <TableHead>Tokens</TableHead>
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
                <TableCell className="font-mono text-xs max-w-[200px] truncate">
                  {run.runKey}
                </TableCell>
                <TableCell>{statusBadge(run.status)}</TableCell>
                <TableCell>{run.entityCount ?? 0}</TableCell>
                <TableCell>{run.relationshipCount ?? 0}</TableCell>
                <TableCell>{run.communityCount ?? 0}</TableCell>
                <TableCell>{run.tokenUsage ?? 0}</TableCell>
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
