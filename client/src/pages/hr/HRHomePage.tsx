/**
 * HR Home Page — Landing page for the HR module (Phase 5 — normalized)
 *
 * Shows KPI summary tiles sourced from analytics dashboard,
 * quick navigation to HR sections, and an alert count for reminders.
 */

import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Bell,
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
  { label: "HR Analytics", icon: PieChart, href: "/hr/analytics", description: "Workforce metrics and reminders" },
  { label: "Talent", icon: Gem, href: "/hr/talent", description: "Talent reviews and succession" },
  // Config
  { label: "Reports", icon: BarChart3, href: "/hr/reports", description: "HR reports and analytics" },
  { label: "Settings", icon: Settings, href: "/hr/settings", description: "HR module configuration" },
];

export default function HRHomePage() {
  const dashboard = trpc.hr.analytics.getDashboardSummary.useQuery();
  const reminders = trpc.hr.analytics.getReminders.useQuery();

  const criticalCount = reminders.data?.filter((r) => r.urgency === "critical").length ?? 0;

  if (dashboard.isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-56" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-muted rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Human Resources</h1>
          <p className="text-muted-foreground">Workforce backbone and staffing management</p>
        </div>
        {criticalCount > 0 && (
          <Link href="/hr/analytics">
            <Badge className="bg-red-500/10 text-red-500 cursor-pointer gap-1">
              <Bell className="w-3 h-3" /> {criticalCount} critical
            </Badge>
          </Link>
        )}
      </div>

      {dashboard.isError && (
        <Card className="border-red-500/50">
          <CardContent className="p-4 text-red-500 text-sm">
            Failed to load HR summary. {dashboard.error?.message}
          </CardContent>
        </Card>
      )}

      {/* KPI Tiles — sourced from analytics dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total Workers</div>
            <div className="text-2xl font-bold">{dashboard.data?.totalWorkers ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Active</div>
            <div className="text-2xl font-bold text-green-500">{dashboard.data?.activeWorkers ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">On Leave</div>
            <div className="text-2xl font-bold text-yellow-500">{dashboard.data?.onLeave ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Terminated</div>
            <div className="text-2xl font-bold text-red-500">{dashboard.data?.terminated ?? "—"}</div>
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
