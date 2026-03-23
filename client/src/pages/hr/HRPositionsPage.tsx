/**
 * HR Positions Page — Position management with table view
 */

import { Card, CardContent } from "@/components/ui/card";
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
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";

export default function HRPositionsPage() {
  const positionsQuery = trpc.hr.organization.listPositions.useQuery({ limit: 100 });

  const statusColor = (s: string) => {
    switch (s) {
      case "open": return "default";
      case "filled": return "secondary";
      case "frozen": return "destructive";
      case "closed": return "outline";
      default: return "outline";
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Position Management</h1>
          <p className="text-muted-foreground">Approved organizational seats</p>
        </div>
        <Link href="/hr"><Button variant="outline" size="sm">Back to HR</Button></Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Headcount</TableHead>
                <TableHead>Budgeted</TableHead>
                <TableHead>Filled</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(positionsQuery.data?.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {positionsQuery.isLoading ? "Loading..." : "No positions defined yet"}
                  </TableCell>
                </TableRow>
              ) : (
                positionsQuery.data?.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono">{p.positionCode}</TableCell>
                    <TableCell className="font-medium">{p.title}</TableCell>
                    <TableCell>{p.headcountLimit}</TableCell>
                    <TableCell>{p.budgeted ? "Yes" : "No"}</TableCell>
                    <TableCell>{p.filled ? "Yes" : "No"}</TableCell>
                    <TableCell><Badge variant={statusColor(p.status)}>{p.status}</Badge></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
