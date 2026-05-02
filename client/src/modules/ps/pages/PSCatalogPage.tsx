/**
 * PS Catalog — Published projects surface.
 *
 * Displays only PUBLISHED PS projects. This is the public catalog
 * output of the PS validation & publishing flow.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  BookOpen,
  ClipboardList,
  Settings,
  Wand2,
  List,
  Loader2,
  FolderOpen,
  Lightbulb,
} from "lucide-react";

const CONFIDENCE_COLORS: Record<string, string> = {
  High: "text-green-400",
  Medium: "text-yellow-400",
  Low: "text-red-400",
};

export function PSCatalogPage() {
  const { data: published, isLoading } = trpc.ps.projects.list.useQuery({
    status: "PUBLISHED",
  });

  const publishedCount = published?.length ?? 0;

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects System</h1>
      </div>

      {/* Navigation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="w-5 h-5 text-indigo-500" />
            PS Catalog
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Published projects from the PS validation pipeline. Only projects that have been validated and published appear here.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/ps/control-panel">
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-1.5" /> Control Panel
              </Button>
            </Link>
            <Link href="/ps/wizard">
              <Button variant="outline" size="sm">
                <Wand2 className="w-4 h-4 mr-1.5" /> PS Wizard
              </Button>
            </Link>
            <Link href="/ps/list">
              <Button variant="outline" size="sm">
                <List className="w-4 h-4 mr-1.5" /> PS List
              </Button>
            </Link>
            <Link href="/ps/ideation">
              <Button variant="outline" size="sm">
                <Lightbulb className="w-4 h-4 mr-1.5" /> PS Ideation
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-purple-500" />
              </div>
              <span className="text-2xl font-bold">{publishedCount}</span>
            </div>
            <p className="text-xs text-muted-foreground">Published Projects</p>
          </CardContent>
        </Card>
      </div>

      {/* Published Projects Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <BookOpen className="w-4 h-4 text-purple-500" />
            Published Projects
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !published || published.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FolderOpen className="w-10 h-10 mb-2" />
              <p className="text-sm">No published projects yet.</p>
              <p className="text-xs mt-1">
                Projects appear here after completing the PS Wizard &rarr; Submit &rarr; Validate &rarr; Publish flow.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Name</th>
                    <th className="pb-2 font-medium text-muted-foreground">Scope</th>
                    <th className="pb-2 font-medium text-muted-foreground">Confidence</th>
                    <th className="pb-2 font-medium text-muted-foreground">Scenario</th>
                    <th className="pb-2 font-medium text-muted-foreground">Published</th>
                  </tr>
                </thead>
                <tbody>
                  {published.map((p) => (
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
                          {p.confidence ?? "\u2014"}
                        </span>
                      </td>
                      <td className="py-2.5 text-xs text-muted-foreground max-w-xs truncate">
                        {p.scenario}
                      </td>
                      <td className="py-2.5 text-xs text-muted-foreground">
                        {p.updatedAt ? new Date(p.updatedAt as string).toLocaleDateString() : "\u2014"}
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

export default PSCatalogPage;
