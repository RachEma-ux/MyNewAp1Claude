import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Plug, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface SourcesProps {
  workspaceId: number;
}

export default function KGIASourcesPage({ workspaceId }: SourcesProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("neo4j");
  const [endpoint, setEndpoint] = useState("");
  const [maxHops, setMaxHops] = useState(4);
  const [maxRows, setMaxRows] = useState(1000);

  const sourcesQuery = trpc.modules.kgia.sources.list.useQuery({ workspaceId });
  const createSource = trpc.modules.kgia.sources.create.useMutation();
  const testConn = trpc.modules.kgia.sources.testConnection.useMutation();
  const deleteSource = trpc.modules.kgia.sources.delete.useMutation();

  const handleCreate = async () => {
    if (!name.trim() || !endpoint.trim()) {
      toast.error("Name and endpoint are required");
      return;
    }
    try {
      await createSource.mutateAsync({
        workspaceId,
        name: name.trim(),
        type: type as any,
        endpoint: endpoint.trim(),
        maxHops,
        maxRows,
      });
      toast.success("Source created");
      setDialogOpen(false);
      setName("");
      setEndpoint("");
      sourcesQuery.refetch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleTest = async (id: number) => {
    try {
      const result = await testConn.mutateAsync({ id, workspaceId });
      if ((result as any).connected) {
        toast.success("Connection successful");
      } else {
        toast.error("Connection failed");
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteSource.mutateAsync({ id, workspaceId });
      toast.success("Source disabled");
      sourcesQuery.refetch();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const sources = sourcesQuery.data ?? [];

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Graph Sources</h3>
          <p className="text-sm text-muted-foreground">
            Register and manage graph database backends for KGIA queries
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" /> Add Source
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register Graph Source</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium">Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Neo4j Instance" />
              </div>
              <div>
                <label className="text-xs font-medium">Type</label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="neo4j">Neo4j</SelectItem>
                    <SelectItem value="sparql">SPARQL</SelectItem>
                    <SelectItem value="neptune_cypher">Neptune (openCypher)</SelectItem>
                    <SelectItem value="neptune_sparql">Neptune (SPARQL)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium">Endpoint</label>
                <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="bolt://localhost:7687" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium">Max Hops</label>
                  <Input type="number" value={maxHops} onChange={(e) => setMaxHops(Number(e.target.value))} min={1} max={10} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium">Max Rows</label>
                  <Input type="number" value={maxRows} onChange={(e) => setMaxRows(Number(e.target.value))} min={1} max={10000} />
                </div>
              </div>
              <Button onClick={handleCreate} disabled={createSource.isPending} className="w-full">
                {createSource.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Register Source
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Allowlisted</TableHead>
                <TableHead>Limits</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No sources registered. Add a graph backend to get started.
                  </TableCell>
                </TableRow>
              )}
              {sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell className="font-medium">{source.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{source.type}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-48 truncate">
                    {source.endpoint}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={source.status === "active" ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {source.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {source.allowlisted ? (
                      <Badge variant="default" className="text-[10px]">Yes</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">No</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {source.maxHops}h / {source.maxRows}r
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleTest(source.id)}
                        title="Test connection"
                      >
                        <Plug className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDelete(source.id)}
                        title="Disable source"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
