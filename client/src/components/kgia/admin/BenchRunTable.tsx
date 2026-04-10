import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle } from "lucide-react";

interface BenchRun {
  id: number;
  passed: boolean | null;
  score: number | null;
  actualMode: string | null;
  actualAnswer: string | null;
  durationMs: number | null;
  notes: string | null;
  createdAt: string;
}

interface BenchRunTableProps {
  runs: BenchRun[];
}

export default function BenchRunTable({ runs }: BenchRunTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Result</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Mode</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
              No benchmark runs
            </TableCell>
          </TableRow>
        )}
        {runs.map((r) => (
          <TableRow key={r.id}>
            <TableCell>
              {r.passed ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
            </TableCell>
            <TableCell>
              <Badge
                variant={r.score && r.score >= 0.7 ? "default" : r.score && r.score >= 0.4 ? "secondary" : "destructive"}
                className="text-[10px]"
              >
                {r.score !== null ? `${(r.score * 100).toFixed(0)}%` : "-"}
              </Badge>
            </TableCell>
            <TableCell className="text-xs">{r.actualMode?.replace(/_/g, " ") ?? "-"}</TableCell>
            <TableCell className="text-xs">{r.durationMs ? `${r.durationMs}ms` : "-"}</TableCell>
            <TableCell className="text-xs text-muted-foreground max-w-48 truncate">{r.notes ?? "-"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
