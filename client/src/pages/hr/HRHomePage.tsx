/**
 * HR Home Page — Landing page for the HR module
 *
 * Shows KPI summary tiles and quick navigation to HR sections.
 */

import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  Users,
  Building2,
  Briefcase,
  UserPlus,
  Award,
  BarChart3,
  Settings,
  FileText,
} from "lucide-react";

const sections = [
  { label: "Directory", icon: Users, href: "/hr/directory", description: "Browse employee directory" },
  { label: "Organization", icon: Building2, href: "/hr/organization", description: "Org units and structure" },
  { label: "Positions", icon: Briefcase, href: "/hr/positions", description: "Position management" },
  { label: "Staffing", icon: UserPlus, href: "/hr/staffing", description: "Workspace assignments" },
  { label: "Skills", icon: Award, href: "/hr/skills", description: "Skills and certifications" },
  { label: "Reports", icon: BarChart3, href: "/hr/reports", description: "HR reports and analytics" },
  { label: "Settings", icon: Settings, href: "/hr/settings", description: "HR module configuration" },
];

export default function HRHomePage() {
  const summary = trpc.hr.directory.getSummary.useQuery();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Human Resources</h1>
          <p className="text-muted-foreground">Workforce backbone and staffing management</p>
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total Workers</div>
            <div className="text-2xl font-bold">{summary.data?.total ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Active</div>
            <div className="text-2xl font-bold text-green-500">{summary.data?.active ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">On Leave</div>
            <div className="text-2xl font-bold text-yellow-500">{summary.data?.onLeave ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Terminated</div>
            <div className="text-2xl font-bold text-red-500">{summary.data?.terminated ?? "—"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Section Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardContent className="p-4 flex items-center gap-3">
                <s.icon className="w-8 h-8 text-primary" />
                <div>
                  <div className="font-medium">{s.label}</div>
                  <div className="text-sm text-muted-foreground">{s.description}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
