import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const statusPillVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors",
  {
    variants: {
      status: {
        active:
          "border-green-500/20 bg-green-500/10 text-green-500",
        success:
          "border-green-500/20 bg-green-500/10 text-green-500",
        pending:
          "border-amber-500/20 bg-amber-500/10 text-amber-500",
        error:
          "border-destructive/20 bg-destructive/10 text-destructive",
        disabled:
          "border-gray-500/20 bg-gray-500/10 text-gray-400",
        draft:
          "border-blue-500/20 bg-blue-500/10 text-blue-500",
        deprecated:
          "border-orange-500/20 bg-orange-500/10 text-orange-500",
      },
      size: {
        sm: "text-[10px] px-1.5 py-px",
        default: "text-xs px-2 py-0.5",
      },
      dot: {
        true: "",
        false: "",
      },
    },
    defaultVariants: {
      status: "active",
      size: "default",
      dot: false,
    },
  },
);

const dotColorMap: Record<string, string> = {
  active: "bg-green-500",
  success: "bg-green-500",
  pending: "bg-amber-500",
  error: "bg-destructive",
  disabled: "bg-gray-400",
  draft: "bg-blue-500",
  deprecated: "bg-orange-500",
};

interface StatusPillProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof statusPillVariants> {
  /** Override the displayed label text. Defaults to the capitalized status name. */
  label?: string;
  asChild?: boolean;
}

function StatusPill({
  className,
  status,
  size,
  dot,
  label,
  asChild = false,
  ...props
}: StatusPillProps) {
  const Comp = asChild ? Slot : "span";
  const statusKey = status ?? "active";
  const displayLabel = label ?? statusKey.charAt(0).toUpperCase() + statusKey.slice(1);

  return (
    <Comp
      data-slot="status-pill"
      className={cn(statusPillVariants({ status, size, className }))}
      {...props}
    >
      {dot && (
        <span
          className={cn(
            "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
            dotColorMap[statusKey],
          )}
        />
      )}
      {displayLabel}
    </Comp>
  );
}

export { StatusPill, statusPillVariants };
export type { StatusPillProps };
