/**
 * HR Role Definitions — List page for canonical role definitions
 *
 * Shows all role definitions with filtering by status, org unit, family, level.
 * Lifecycle badges indicate current version state.
 * Actions are gated by HR role.
 */

import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useHrRole } from "@/hooks/useHrRole";
import { ArrowLeft, Plus, Search } from "lucide-react";

const statusVariant = (s: string | null) => {
  switch (s) {
    case "effective": return "default";
    case "published": return "default";
    case "approved": return "secondary";
    case "in_review": return "outline";
    case "draft": return "outline";
    case "superseded": return "outline";
    case "retired": return "destructive";
    default: return "outline";
  }
};

export default function HRRoleDefinitionsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { can, isHrbp } = useHrRole();

  const roleDefsQuery = trpc.hr.roleDefinitions.list.useQuery({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    limit: 100,
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
            <Link href="/hr"><a className="hover:text-foreground">HR</a></Link>
            <span className="mx-1">/</span>
            <span className="text-foreground">Role Definitions</span>
          </nav>
          <h1 className="text-2xl font-bold">Role Definitions</h1>
          <p className="text-muted-foreground">Canonical, versioned role definitions</p>
        </div>
        <div className="flex gap-2">
          <Link href="/hr"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button></Link>
          {can("hr.roledef.draft") && (
            <Link href="/hr/role-definitions/new">
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> New Role Definition</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title or code..."
            className="w-[260px] pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="retired">Retired</SelectItem>
          </SelectContent>
        </Select>
        {isHrbp && (
          <Link href="/hr/role-definitions/review">
            <Button variant="outline" size="sm">Review Queue</Button>
          </Link>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Version Status</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>Effective From</TableHead>
                <TableHead>Entity Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(roleDefsQuery.data?.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {roleDefsQuery.isLoading ? "Loading..." : "No role definitions found"}
                  </TableCell>
                </TableRow>
              ) : (
                roleDefsQuery.data?.map((rd) => (
                  <TableRow key={rd.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <Link href={`/hr/role-definitions/${rd.id}`}>
                        <span className="font-mono text-primary hover:underline">{rd.roleCode}</span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/hr/role-definitions/${rd.id}`}>
                        <span className="font-medium hover:underline">{rd.title}</span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(rd.currentVersionStatus)}>
                        {rd.currentVersionStatus ?? "no version"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {rd.visibilityClass ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{rd.effectiveFrom ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={rd.status === "active" ? "default" : "destructive"}>
                        {rd.status}
                      </Badge>
                    </TableCell>
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
