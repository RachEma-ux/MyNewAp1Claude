import { trpc } from "@/lib/trpc";
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
import { ShieldCheck, ShieldX, AlertTriangle } from "lucide-react";

interface GovernanceProps {
  workspaceId: number;
}

export default function KGIAGovernancePage({ workspaceId }: GovernanceProps) {
  const decisionsQuery = trpc.modules.kgia.audit.list.useQuery(
    { workspaceId, limit: 100 },
    { refetchInterval: 10000 }
  );

  const decisions = decisionsQuery.data ?? [];

  // Summary stats
  const total = decisions.length;
  const allows = decisions.filter((d) => d.decision === "allow").length;
  const denies = decisions.filter((d) => d.decision === "deny").length;
  const reviews = decisions.filter((d) => d.decision === "review_required").length;

  const pct = (n: number) => (total > 0 ? ((n / total) * 100).toFixed(0) : "0");

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div>
        <h3 className="text-lg font-semibold">Governance Audit Trail</h3>
        <p className="text-sm text-muted-foreground">
          Non-bypassable policy decisions logged for all KGIA operations
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground">Total Decisions</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-green-500 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Allowed
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-bold text-green-500">{allows}</div>
            <div className="text-xs text-muted-foreground">{pct(allows)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-red-500 flex items-center gap-1">
              <ShieldX className="w-3 h-3" /> Denied
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-bold text-red-500">{denies}</div>
            <div className="text-xs text-muted-foreground">{pct(denies)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-yellow-500 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Review Required
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-bold text-yellow-500">{reviews}</div>
            <div className="text-xs text-muted-foreground">{pct(reviews)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Decisions table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Decision</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Policy Rule</TableHead>
                <TableHead>Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {decisions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No policy decisions recorded yet
                  </TableCell>
                </TableRow>
              )}
              {decisions.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Badge
                      variant={
                        d.decision === "allow"
                          ? "default"
                          : d.decision === "deny"
                          ? "destructive"
                          : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {d.decision}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-medium">{d.action}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-64 truncate">
                    {d.reason ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {d.policyRule ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {d.createdAt ? new Date(d.createdAt).toLocaleString() : "—"}
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
