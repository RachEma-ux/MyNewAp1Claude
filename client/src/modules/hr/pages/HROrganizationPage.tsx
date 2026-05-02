/**
 * HR Organization Page — Org units tree/table view
 */

import { useState } from "react";
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
import { Building2, ChevronRight, ChevronDown } from "lucide-react";
import { Link } from "wouter";

interface OrgNode {
  id: number;
  code: string;
  name: string;
  type: string;
  status: string;
  parentOrgUnitId: number | null;
  managerWorkerId: number | null;
  children: OrgNode[];
}

function OrgTreeNode({ node, depth = 0 }: { node: OrgNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded cursor-pointer"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
        ) : (
          <span className="w-4" />
        )}
        <Building2 className="w-4 h-4 text-primary" />
        <span className="font-medium text-sm">{node.name}</span>
        <Badge variant="outline" className="text-xs">{node.type}</Badge>
        <span className="text-xs text-muted-foreground ml-auto">{node.code}</span>
      </div>
      {expanded && node.children.map((child) => (
        <OrgTreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function HROrganizationPage() {
  const [view, setView] = useState<"tree" | "table">("tree");
  const treeQuery = trpc.hr.organization.getOrgTree.useQuery();
  const listQuery = trpc.hr.organization.listOrgUnits.useQuery({});

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Organization Structure</h1>
          <p className="text-muted-foreground">Departments, divisions, and teams</p>
        </div>
        <div className="flex gap-2">
          <Button variant={view === "tree" ? "default" : "outline"} size="sm" onClick={() => setView("tree")}>Tree</Button>
          <Button variant={view === "table" ? "default" : "outline"} size="sm" onClick={() => setView("table")}>Table</Button>
          <Link href="/hr"><Button variant="outline" size="sm">Back to HR</Button></Link>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          {view === "tree" ? (
            <div>
              {treeQuery.isLoading && <p className="text-muted-foreground">Loading...</p>}
              {(treeQuery.data?.length ?? 0) === 0 && !treeQuery.isLoading && (
                <p className="text-muted-foreground">No org units defined yet</p>
              )}
              {(treeQuery.data as OrgNode[] | undefined)?.map((node) => (
                <OrgTreeNode key={node.id} node={node} />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(listQuery.data?.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      {listQuery.isLoading ? "Loading..." : "No org units found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  listQuery.data?.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono">{u.code}</TableCell>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell><Badge variant="outline">{u.type}</Badge></TableCell>
                      <TableCell><Badge>{u.status}</Badge></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
