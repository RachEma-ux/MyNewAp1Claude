/**
 * HR Section Landing Page — Reusable landing component for all 13 HR sections.
 *
 * Phase 2: Carbon SideNav Section Landing Pages
 *
 * Consumes the canonical HR nav config (hrNavConfig.ts) as source of truth.
 * Renders section title, purpose, and child capability cards filtered by role.
 * Handles existing-page links, not-yet-implemented placeholders, and empty states.
 */

import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useHrRole } from "@/hooks/useHrRole";
import { findSectionById, type HrNavSection, type HrNavItem } from "@/config/hrNavConfig";
import {
  ArrowLeft,
  Building2,
  Briefcase,
  UserPlus,
  UserMinus,
  UserCheck,
  Award,
  Users,
  Clock,
  Calendar,
  CalendarDays,
  BookOpen,
  ShieldCheck,
  Target,
  Star,
  DollarSign,
  Heart,
  ScrollText,
  Scale,
  ClipboardList,
  Smile,
  AlertTriangle,
  Shield,
  PieChart,
  BarChart3,
  Gem,
  Settings,
  Lock,
  ChevronRight,
  FileText,
  type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Icon hint → Lucide icon mapping
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  // Section-level icons
  organization: Building2,
  "user-follow": UserPlus,
  flow: UserCheck,
  document: FileText,
  currency: DollarSign,
  time: Clock,
  education: BookOpen,
  "chart-line": BarChart3,
  "user-activity": Scale,
  wellness: Smile,
  analytics: PieChart,
  security: Lock,
  rule: Shield,
  // Item-level icons
  layers: Building2,
  diagram: Building2,
  calculator: BarChart3,
  briefcase: Briefcase,
  clipboard: ClipboardList,
  megaphone: ClipboardList,
  funnel: Users,
  calendar: Calendar,
  checklist: ClipboardList,
  key: Lock,
  share: UserCheck,
  chat: Smile,
  lock: Lock,
  user: Users,
  "user-minus": UserMinus,
  "document-stack": FileText,
  edit: FileText,
  certificate: ShieldCheck,
  mail: FileText,
  "chart-bar": BarChart3,
  trophy: Award,
  heart: Heart,
  bank: DollarSign,
  gift: Heart,
  clock: Clock,
  "calendar-off": Calendar,
  "clock-plus": CalendarDays,
  "calendar-grid": CalendarDays,
  book: BookOpen,
  alert: AlertTriangle,
  "trending-up": Target,
  history: Clock,
  target: Target,
  "clipboard-check": Star,
  refresh: Users,
  users: Users,
  path: Gem,
  "file-text": ScrollText,
  "alert-triangle": AlertTriangle,
  gavel: Scale,
  search: ClipboardList,
  form: ClipboardList,
  sparkles: Smile,
  award: Award,
  dashboard: PieChart,
  "trending-down": BarChart3,
  globe: Users,
  "file-check": BarChart3,
  "chart-custom": BarChart3,
  "users-cog": Settings,
  "shield-lock": Lock,
  "eye-off": Lock,
  "list-ordered": ClipboardList,
  "shield-check": ShieldCheck,
  "alert-circle": AlertTriangle,
  "bar-chart": BarChart3,
};

function getIcon(hint: string | undefined): LucideIcon {
  if (!hint) return FileText;
  return ICON_MAP[hint] ?? FileText;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Breadcrumb({ sectionLabel }: { sectionLabel: string }) {
  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
      <Link href="/hr">
        <a className="hover:text-foreground transition-colors">HR</a>
      </Link>
      <ChevronRight className="w-3 h-3" />
      <span className="text-foreground">{sectionLabel}</span>
    </nav>
  );
}

function ChildCard({ item }: { item: HrNavItem }) {
  const Icon = getIcon(item.iconHint);
  const isLive = item.implementationStatus === "live" || item.implementationStatus === "placeholder";
  const targetRoute = item.currentRoute ?? item.href;

  if (!isLive) {
    return (
      <Card className="opacity-60 cursor-default">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
            <Icon className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{item.label}</span>
              <Badge variant="outline" className="text-xs">Coming soon</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.purpose}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Link href={targetRoute}>
      <Card className="cursor-pointer hover:bg-muted/50 transition-colors group">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{item.label}</div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.purpose}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </CardContent>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface HRSectionLandingPageProps {
  sectionId: string;
}

export default function HRSectionLandingPage({ sectionId }: HRSectionLandingPageProps) {
  const section = findSectionById(sectionId);
  const { can, isLoading } = useHrRole();

  if (!section) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/hr">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <h1 className="text-2xl font-bold">Section Not Found</h1>
        </div>
        <p className="text-muted-foreground">The requested HR section does not exist.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-32" />
          <div className="h-8 bg-muted rounded w-64" />
          <div className="h-4 bg-muted rounded w-96" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Filter children by role visibility
  const visibleItems = section.items.filter((item) => {
    if (item.visibilityMode === "show") return true;
    if (item.visibilityMode === "hide-if-no-access") {
      return can(item.requiredAction);
    }
    return true;
  });

  const SectionIcon = getIcon(section.iconHint);
  const liveCount = visibleItems.filter(
    (i) => i.implementationStatus === "live" || i.implementationStatus === "placeholder",
  ).length;
  const plannedCount = visibleItems.length - liveCount;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Breadcrumb sectionLabel={section.label} />
        <div className="flex items-center gap-3">
          <Link href="/hr">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <SectionIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{section.label}</h1>
              <p className="text-muted-foreground text-sm">{section.purpose}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-3 text-sm">
        <Badge variant="secondary">{liveCount} available</Badge>
        {plannedCount > 0 && (
          <Badge variant="outline">{plannedCount} planned</Badge>
        )}
      </div>

      {/* Child capability cards */}
      {visibleItems.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <SectionIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-medium mb-1">No accessible capabilities</h3>
            <p className="text-sm text-muted-foreground">
              You don't have access to any items in this section.
              Contact your HR administrator for access.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibleItems.map((item) => (
            <ChildCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
