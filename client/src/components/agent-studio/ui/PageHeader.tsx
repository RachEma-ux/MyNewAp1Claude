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
    <div className="border-b pb-3 mb-4 flex items-start justify-between gap-4 flex-wrap">
      {/* Title column — needs min-w-[200px] so the subtitle doesn't get
          squeezed down to 1 word per line on narrow viewports when the
          actions cluster is wide. flex-wrap on the parent makes the
          actions drop to a second row instead of squeezing the title. */}
      <div className="min-w-[200px] flex-1">
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
      {actions && (
        <div className="flex items-center gap-1 shrink-0 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}
