/**
 * HR Directory Page — Employee directory with search, filters, and detail
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { Search, UserPlus, X } from "lucide-react";
import { Link } from "wouter";

export default function HRDirectoryPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);

  const listQuery = trpc.hr.directory.list.useQuery({
    limit: 100,
    status: statusFilter !== "all" ? statusFilter : undefined,
    workerType: typeFilter !== "all" ? typeFilter : undefined,
  });

  const searchQuery = trpc.hr.directory.search.useQuery(
    { query: search, limit: 30 },
    { enabled: search.length >= 2 }
  );

  const detailQuery = trpc.hr.directory.getById.useQuery(
    { workerId: selectedWorkerId! },
    { enabled: !!selectedWorkerId }
  );

  const assignmentsQuery = trpc.hr.directory.getAssignments.useQuery(
    { workerId: selectedWorkerId! },
    { enabled: !!selectedWorkerId }
  );

  const rows = search.length >= 2 ? (searchQuery.data ?? []) : (listQuery.data ?? []);

  const statusColor = (s: string) => {
    switch (s) {
      case "active": return "default";
      case "on_leave": return "secondary";
      case "terminated": return "destructive";
      default: return "outline";
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Employee Directory</h1>
          <p className="text-muted-foreground">Browse and manage workforce records</p>
        </div>
        <Link href="/hr">
          <Button variant="outline" size="sm">Back to HR</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, employee number..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_leave">On Leave</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="terminated">Terminated</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Worker Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="employee">Employee</SelectItem>
            <SelectItem value="contractor">Contractor</SelectItem>
            <SelectItem value="intern">Intern</SelectItem>
            <SelectItem value="consultant">Consultant</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Employee #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {listQuery.isLoading ? "Loading..." : "No employees found"}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r: any) => (
                  <TableRow
                    key={r.workerId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedWorkerId(r.workerId)}
                  >
                    <TableCell className="font-medium">{r.displayName}</TableCell>
                    <TableCell>{r.primaryEmail}</TableCell>
                    <TableCell>{r.employeeNumber || "—"}</TableCell>
                    <TableCell><Badge variant="outline">{r.workerType}</Badge></TableCell>
                    <TableCell><Badge variant={statusColor(r.status)}>{r.status}</Badge></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Panel */}
      <Sheet open={!!selectedWorkerId} onOpenChange={(open) => !open && setSelectedWorkerId(null)}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>{detailQuery.data?.displayName || "Worker Detail"}</SheetTitle>
          </SheetHeader>
          {detailQuery.data && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Name:</span> {detailQuery.data.firstName} {detailQuery.data.lastName}</div>
                <div><span className="text-muted-foreground">Preferred:</span> {detailQuery.data.preferredName || "—"}</div>
                <div><span className="text-muted-foreground">Email:</span> {detailQuery.data.primaryEmail}</div>
                <div><span className="text-muted-foreground">Employee #:</span> {detailQuery.data.employeeNumber || "—"}</div>
                <div><span className="text-muted-foreground">Type:</span> {detailQuery.data.workerType}</div>
                <div><span className="text-muted-foreground">Category:</span> {detailQuery.data.employmentCategory}</div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={statusColor(detailQuery.data.status)}>{detailQuery.data.status}</Badge></div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2">Workspace Assignments</h3>
                {(assignmentsQuery.data?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No active assignments</p>
                ) : (
                  <div className="space-y-2">
                    {assignmentsQuery.data?.map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between text-sm border rounded p-2">
                        <div>WS #{a.workspaceId} — {a.roleCode}</div>
                        <Badge variant="outline">{a.allocationPct}%</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
