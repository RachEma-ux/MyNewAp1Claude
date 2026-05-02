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
import { Loader2, Plug } from "lucide-react";

export function GraphRAGSourceAdapters() {
  const { data: adapters, isLoading } =
    trpc.dataAnalysis.graphRag.listAdapters.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!adapters || adapters.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="py-12 text-center">
          <Plug className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">
            No source adapters registered yet.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Adapters are registered programmatically by each module at application startup.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-sm">Registered Source Adapters</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Module</TableHead>
              <TableHead>Dataset Key</TableHead>
              <TableHead>Display Name</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adapters.map((a) => (
              <TableRow key={`${a.moduleSlug}:${a.datasetKey}`}>
                <TableCell>
                  <Badge variant="outline">{a.moduleSlug}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {a.datasetKey}
                </TableCell>
                <TableCell>{a.displayName}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                  {a.description}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="mt-4 text-xs text-muted-foreground border-t pt-3">
          <p>
            Each adapter is hard-bound to one module. Adapters export normalized documents
            that GraphRAG indexes. No adapter can access another module's data.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
