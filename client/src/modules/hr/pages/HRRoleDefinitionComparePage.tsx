/**
 * HR Role Definition Compare Page — Side-by-side version comparison
 *
 * Shows differences between two versions of a role definition.
 */

import { Link, useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, GitCompare } from "lucide-react";

function DiffRow({ field, valueA, valueB }: { field: string; valueA: unknown; valueB: unknown }) {
  const formatValue = (v: unknown): string => {
    if (v === null || v === undefined) return "(empty)";
    if (Array.isArray(v)) return v.join("; ");
    return String(v);
  };

  return (
    <div className="border rounded p-3 space-y-2">
      <div className="font-medium text-sm capitalize">{field.replace(/([A-Z])/g, " $1").trim()}</div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="bg-red-500/10 rounded p-2">
          <Badge variant="outline" className="mb-1 text-xs">Version A</Badge>
          <p className="text-muted-foreground">{formatValue(valueA)}</p>
        </div>
        <div className="bg-green-500/10 rounded p-2">
          <Badge variant="outline" className="mb-1 text-xs">Version B</Badge>
          <p className="text-muted-foreground">{formatValue(valueB)}</p>
        </div>
      </div>
    </div>
  );
}

export default function HRRoleDefinitionComparePage() {
  const [, params] = useRoute("/hr/role-definitions/:id/compare");
  const roleDefId = Number(params?.id);

  // Parse query params from URL
  const urlParams = new URLSearchParams(window.location.search);
  const versionIdA = Number(urlParams.get("a") || "0");
  const versionIdB = Number(urlParams.get("b") || "0");

  const compareQuery = trpc.hr.roleDefinitions.compareVersions.useQuery(
    { versionIdA, versionIdB },
    { enabled: !!versionIdA && !!versionIdB }
  );

  if (!versionIdA || !versionIdB) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <p className="text-muted-foreground">Missing version IDs for comparison. Use ?a=ID&b=ID query parameters.</p>
        <Link href={`/hr/role-definitions/${roleDefId}`}>
          <Button variant="outline" size="sm" className="mt-4"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
        </Link>
      </div>
    );
  }

  if (compareQuery.isLoading) {
    return <div className="p-6 max-w-5xl mx-auto"><div className="animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-64" /><div className="h-40 bg-muted rounded" /></div></div>;
  }

  const data = compareQuery.data;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
          <Link href="/hr"><a className="hover:text-foreground">HR</a></Link>
          <span className="mx-1">/</span>
          <Link href="/hr/role-definitions"><a className="hover:text-foreground">Role Definitions</a></Link>
          <span className="mx-1">/</span>
          <Link href={`/hr/role-definitions/${roleDefId}`}><a className="hover:text-foreground">#{roleDefId}</a></Link>
          <span className="mx-1">/</span>
          <span className="text-foreground">Compare</span>
        </nav>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitCompare className="w-6 h-6" /> Version Comparison
          </h1>
          <Link href={`/hr/role-definitions/${roleDefId}`}>
            <Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          </Link>
        </div>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-3">
                <div className="text-sm">
                  <Badge variant="outline">Version A</Badge>
                  <span className="ml-2 font-mono">v{data.versionA.versionNumber}</span>
                  <Badge className="ml-2" variant="secondary">{data.versionA.status}</Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-sm">
                  <Badge variant="outline">Version B</Badge>
                  <span className="ml-2 font-mono">v{data.versionB.versionNumber}</span>
                  <Badge className="ml-2" variant="secondary">{data.versionB.status}</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {data.differences.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">No differences found between these versions.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{data.differences.length} field(s) differ</p>
              {data.differences.map((diff, i) => (
                <DiffRow key={i} field={diff.field} valueA={diff.valueA} valueB={diff.valueB} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
