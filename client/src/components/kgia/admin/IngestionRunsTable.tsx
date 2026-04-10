import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Ingestion {
  id: number;
  name: string;
  status: string;
  documentCount: number;
  chunkCount: number;
  entityCount: number;
  relationCount: number;
  errorMessage?: string | null;
  createdAt: string;
}

interface IngestionRunsTableProps {
  ingestions: Ingestion[];
}

export default function IngestionRunsTable({ ingestions }: IngestionRunsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Docs</TableHead>
          <TableHead>Chunks</TableHead>
          <TableHead>Entities</TableHead>
          <TableHead>Relations</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ingestions.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
              No ingestion runs
            </TableCell>
          </TableRow>
        )}
        {ingestions.map((ing) => (
          <TableRow key={ing.id}>
            <TableCell className="font-medium text-sm">{ing.name}</TableCell>
            <TableCell>
              <Badge
                variant={ing.status === "completed" ? "default" : ing.status === "failed" ? "destructive" : "secondary"}
                className="text-[10px]"
              >
                {ing.status}
              </Badge>
            </TableCell>
            <TableCell className="text-xs">{ing.documentCount}</TableCell>
            <TableCell className="text-xs">{ing.chunkCount}</TableCell>
            <TableCell className="text-xs">{ing.entityCount}</TableCell>
            <TableCell className="text-xs">{ing.relationCount}</TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {new Date(ing.createdAt).toLocaleDateString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
