/**
 * PS List — Project list/table view with placeholder data
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList } from "lucide-react";

const DEMO_PROJECTS = [
  { id: 1, name: "Platform Migration", type: "Standard", priority: "High", status: "Active" },
  { id: 2, name: "Mobile App Redesign", type: "Agile", priority: "Medium", status: "Draft" },
  { id: 3, name: "Data Pipeline Upgrade", type: "Hybrid", priority: "Critical", status: "Active" },
  { id: 4, name: "Security Audit 2026", type: "Waterfall", priority: "High", status: "Completed" },
  { id: 5, name: "API Gateway Refactor", type: "Agile", priority: "Low", status: "Draft" },
];

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-500/10 text-green-600 border-green-500/30",
  Draft: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  Completed: "bg-blue-500/10 text-blue-600 border-blue-500/30",
};

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "bg-red-500/10 text-red-600",
  High: "bg-orange-500/10 text-orange-600",
  Medium: "bg-amber-500/10 text-amber-600",
  Low: "bg-gray-500/10 text-gray-500",
};

export function PSListPage({ workspaceId }: { workspaceId: number }) {
  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">PS List</h1>
        <Badge variant="secondary">{DEMO_PROJECTS.length} projects</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ClipboardList className="w-4 h-4 text-indigo-500" />
            All Projects
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Name</th>
                  <th className="pb-2 font-medium text-muted-foreground">Type</th>
                  <th className="pb-2 font-medium text-muted-foreground">Priority</th>
                  <th className="pb-2 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_PROJECTS.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 font-medium">{p.name}</td>
                    <td className="py-2.5"><Badge variant="outline" className="text-xs">{p.type}</Badge></td>
                    <td className="py-2.5"><Badge className={`text-xs border-0 ${PRIORITY_COLORS[p.priority] || ""}`}>{p.priority}</Badge></td>
                    <td className="py-2.5"><Badge className={`text-xs ${STATUS_COLORS[p.status] || ""}`}>{p.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default PSListPage;
