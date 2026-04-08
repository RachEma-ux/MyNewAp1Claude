/**
 * AI Agent Studio — Shared Page Header
 *
 * Consistent enterprise-shell page header used by every section page.
 * Standardizes title, optional subtitle, optional icon, and trailing
 * actions slot. Pure presentational — no data, no logic.
 */
import { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  /** Optional badges rendered to the right of the title */
  badges?: ReactNode;
  /** Optional action buttons rendered on the right edge */
  actions?: ReactNode;
}

export default function PageHeader({
  title,
  subtitle,
  icon,
  badges,
  actions,
}: PageHeaderProps) {
  return (
    <div className="border-b pb-3 mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {icon && <span className="text-muted-foreground/80">{icon}</span>}
          <h2 className="text-base font-semibold tracking-tight truncate">
            {title}
          </h2>
          {badges}
        </div>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
    </div>
  );
}
