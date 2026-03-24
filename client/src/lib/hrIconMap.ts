/**
 * HR Icon Map — Shared icon-hint-to-Lucide resolver
 *
 * Single source of truth for mapping `iconHint` strings from hrNavConfig.ts
 * to Lucide icon components. Used by HRSideNav and HRSectionLandingPage.
 */

import {
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
  FileText,
  type LucideIcon,
} from "lucide-react";

export const HR_ICON_MAP: Record<string, LucideIcon> = {
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

/**
 * Resolve an iconHint string to a Lucide icon component.
 * Returns `fallback` (defaults to FileText) if the hint is not mapped.
 */
export function resolveHrIcon(
  hint: string | undefined,
  fallback: LucideIcon = FileText,
): LucideIcon {
  if (!hint) return fallback;
  return HR_ICON_MAP[hint] ?? fallback;
}
