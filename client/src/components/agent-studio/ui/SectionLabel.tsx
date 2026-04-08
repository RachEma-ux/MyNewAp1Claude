/**
 * AI Agent Studio — Shared Section Label
 *
 * Tiny uppercase label used inside cards to introduce a sub-section.
 * Replaces dozens of inline patterns like:
 *   `text-[10px] uppercase text-muted-foreground/70 font-semibold`
 */
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export default function SectionLabel({ children, icon, className }: Props) {
  return (
    <div
      className={cn(
        "text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70 flex items-center gap-1",
        className
      )}
    >
      {icon}
      {children}
    </div>
  );
}
