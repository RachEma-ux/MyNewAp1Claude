/**
 * AI Agent Studio — Shared Empty State
 *
 * Consistent enterprise-grade empty state. Replaces bare "No X yet" strings
 * with a centered icon + title + description + optional action.
 */
import { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Compact variant for inline usage in narrow panels */
  compact?: boolean;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-4" : "py-8"
      }`}
    >
      {icon && (
        <div className="mb-2 text-muted-foreground/40">
          <div className="w-8 h-8 flex items-center justify-center">{icon}</div>
        </div>
      )}
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {description && (
        <p className="text-[10px] text-muted-foreground/70 mt-1 max-w-xs">
          {description}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
