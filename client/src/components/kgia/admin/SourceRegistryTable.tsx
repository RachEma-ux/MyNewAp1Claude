import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plug, Trash2 } from "lucide-react";

interface Source {
  id: number;
  name: string;
  type: string;
  endpoint: string;
  status: string;
  allowlisted: boolean;
  maxHops: number;
  maxRows: number;
}

interface SourceRegistryTableProps {
  sources: Source[];
  onTest: (id: number) => void;
  onDelete: (id: number) => void;
}

export default function SourceRegistryTable({ sources, onTest, onDelete }: SourceRegistryTableProps) {
  return (
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
              No sources registered
            </TableCell>
          </TableRow>
        )}
        {sources.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="font-medium">{s.name}</TableCell>
            <TableCell><Badge variant="outline" className="text-[10px]">{s.type}</Badge></TableCell>
            <TableCell className="text-xs text-muted-foreground max-w-48 truncate">{s.endpoint}</TableCell>
            <TableCell><Badge variant={s.status === "active" ? "default" : "secondary"} className="text-[10px]">{s.status}</Badge></TableCell>
            <TableCell><Badge variant={s.allowlisted ? "default" : "secondary"} className="text-[10px]">{s.allowlisted ? "Yes" : "No"}</Badge></TableCell>
            <TableCell className="text-xs text-muted-foreground">{s.maxHops}h / {s.maxRows}r</TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onTest(s.id)}><Plug className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
