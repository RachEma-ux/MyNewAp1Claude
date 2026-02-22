import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface DataTableShellProps extends React.ComponentProps<"div"> {
  title?: string;
  description?: string;
  /** Slot rendered in the header area to the right of the title. */
  headerActions?: React.ReactNode;
  /** Slot rendered above the table (search, filters, bulk actions). */
  toolbar?: React.ReactNode;
  /** The table element or content. */
  children: React.ReactNode;
  /** Shown when the table has no rows. */
  emptyState?: React.ReactNode;
  /** When true, the emptyState is rendered instead of children. */
  isEmpty?: boolean;
  /** Pagination controls rendered below the table. */
  pagination?: React.ReactNode;
}

function DataTableShell({
  title,
  description,
  headerActions,
  toolbar,
  children,
  emptyState,
  isEmpty = false,
  pagination,
  className,
  ...props
}: DataTableShellProps) {
  return (
    <Card className={cn(className)} {...props}>
      {(title || headerActions) && (
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              {title && <CardTitle>{title}</CardTitle>}
              {description && <CardDescription>{description}</CardDescription>}
            </div>
            {headerActions}
          </div>
        </CardHeader>
      )}
      <CardContent className="space-y-4">
        {toolbar}
        {isEmpty && emptyState ? emptyState : children}
        {pagination}
      </CardContent>
    </Card>
  );
}

export { DataTableShell };
export type { DataTableShellProps };
