/**
 * PS List — PS Projects list (formal artifacts from PS Wizard)
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ClipboardList, Loader2, FolderOpen, Pencil, Check, X } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-600 border-green-500/30",
  draft: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  archived: "bg-gray-500/10 text-gray-500 border-gray-500/30",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  High: "text-green-400",
  Medium: "text-yellow-400",
  Low: "text-red-400",
};

export function PSListPage() {
  const { data: projects, isLoading } = trpc.ps.projects.list.useQuery();

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">PS Projects</h1>
        <Badge variant="secondary">{projects?.length ?? 0} projects</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ClipboardList className="w-4 h-4 text-indigo-500" />
            All Projects
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !projects || projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FolderOpen className="w-10 h-10 mb-2" />
              <p className="text-sm">No projects yet. Use the PS Wizard to create one.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Name</th>
                    <th className="pb-2 font-medium text-muted-foreground">Scope</th>
                    <th className="pb-2 font-medium text-muted-foreground">Confidence</th>
                    <th className="pb-2 font-medium text-muted-foreground">Matrix</th>
                    <th className="pb-2 font-medium text-muted-foreground">Status</th>
                    <th className="pb-2 font-medium text-muted-foreground">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5">
                        <span className="font-medium">{p.name}</span>
                      </td>
                      <td className="py-2.5">
                        <Badge variant="outline" className="text-xs">
                          {p.selectedScopeCode}
                        </Badge>
                      </td>
                      <td className="py-2.5">
                        <span className={`text-sm font-medium ${CONFIDENCE_COLORS[p.confidence ?? ""] || "text-muted-foreground"}`}>
                          {p.confidence ?? "—"}
                        </span>
                      </td>
                      <td className="py-2.5 text-xs text-muted-foreground">
                        v{p.matrixVersionId ?? "—"}
                      </td>
                      <td className="py-2.5">
                        <Badge className={`text-xs ${STATUS_COLORS[p.status] || ""}`}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-xs text-muted-foreground">
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default PSListPage;
