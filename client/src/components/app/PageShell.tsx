import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import type { LucideIcon } from "lucide-react";

interface PageShellProps extends React.ComponentProps<"div"> {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** When set, renders a back arrow that navigates to this path. */
  backHref?: string;
  /** Action buttons rendered to the right of the title. */
  actions?: React.ReactNode;
}

function PageShell({
  title,
  subtitle,
  icon: Icon,
  backHref,
  actions,
  children,
  className,
  ...props
}: PageShellProps) {
  const [, setLocation] = useLocation();

  return (
    <div className={cn("space-y-6", className)} {...props}>
      <div className="flex flex-wrap items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4 min-w-0">
          {backHref && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation(backHref)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              {Icon && <Icon className="h-8 w-8 shrink-0" />}
              {title}
            </h1>
            {subtitle && (
              <p className="text-muted-foreground mt-1 text-sm sm:text-base">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
      {children}
    </div>
  );
}

export { PageShell };
export type { PageShellProps };
