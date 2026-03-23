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
  Clock,
  Calendar,
  CalendarDays,
  BookOpen,
  ShieldCheck,
  Target,
  Star,
  UserCheck,
  UserMinus,
  DollarSign,
  Heart,
  ScrollText,
  Scale,
  ClipboardList,
  Smile,
  AlertTriangle,
  Shield,
  PieChart,
  Gem,
} from "lucide-react";

const sections = [
  // Phase 1 — Workforce Backbone
  { label: "Directory", icon: Users, href: "/hr/directory", description: "Browse employee directory" },
  { label: "Organization", icon: Building2, href: "/hr/organization", description: "Org units and structure" },
  { label: "Positions", icon: Briefcase, href: "/hr/positions", description: "Position management" },
  { label: "Staffing", icon: UserPlus, href: "/hr/staffing", description: "Workspace assignments" },
  { label: "Skills", icon: Award, href: "/hr/skills", description: "Skills and certifications" },
  // Phase 2 — Lifecycle
  { label: "Recruitment", icon: FileText, href: "/hr/recruitment", description: "Recruitment pipeline" },
  { label: "Onboarding", icon: UserCheck, href: "/hr/onboarding", description: "New hire onboarding" },
  { label: "Offboarding", icon: UserMinus, href: "/hr/offboarding", description: "Exit workflows" },
  // Phase 3 — Workforce Operations
  { label: "Timesheet", icon: Clock, href: "/hr/timesheet", description: "Time entries and tracking" },
  { label: "Leave", icon: Calendar, href: "/hr/leave", description: "Leave requests and approvals" },
  { label: "Overtime", icon: CalendarDays, href: "/hr/overtime", description: "Overtime requests" },
  { label: "Shift Planning", icon: CalendarDays, href: "/hr/shifts", description: "Shift plans and assignments" },
  { label: "Training", icon: BookOpen, href: "/hr/training", description: "Training catalog and learning" },
  { label: "Certifications", icon: ShieldCheck, href: "/hr/certifications", description: "Certification tracking" },
  { label: "Goals", icon: Target, href: "/hr/goals", description: "Employee goals and objectives" },
  { label: "Reviews", icon: Star, href: "/hr/reviews", description: "Performance reviews" },
  // Phase 4 — Compensation & Benefits
  { label: "Compensation", icon: DollarSign, href: "/hr/compensation", description: "Salary bands and comp records" },
  { label: "Benefits", icon: Heart, href: "/hr/benefits", description: "Benefit plans and enrollments" },
  // Phase 4 — Employee Relations
  { label: "Policies", icon: ScrollText, href: "/hr/policies", description: "HR policies and acknowledgements" },
  { label: "Grievances", icon: Scale, href: "/hr/grievances", description: "Grievances and investigations" },
  // Phase 4 — Engagement
  { label: "Surveys", icon: ClipboardList, href: "/hr/surveys", description: "Employee surveys" },
  { label: "Engagement", icon: Smile, href: "/hr/engagement", description: "Programs and recognition" },
  // Phase 4 — Compliance & Risk
  { label: "Incidents", icon: AlertTriangle, href: "/hr/incidents", description: "Incident reports" },
  { label: "Compliance", icon: Shield, href: "/hr/compliance-mgmt", description: "Obligations and risk register" },
  // Phase 4 — Analytics & Talent
  { label: "HR Analytics", icon: PieChart, href: "/hr/analytics", description: "Workforce metrics dashboard" },
  { label: "Talent", icon: Gem, href: "/hr/talent", description: "Talent reviews and succession" },
  // Config
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
