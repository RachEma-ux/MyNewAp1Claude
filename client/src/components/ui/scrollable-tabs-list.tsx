/**
 * ScrollableTabsList — Horizontal scrollable tab rail
 *
 * Drop-in replacement for TabsList when many tabs overflow on mobile.
 * Provides:
 *  - Hidden native scrollbar (clean touch-scroll only)
 *  - Trailing spacer so last tab scrolls fully into view
 *  - Dynamic edge-fade affordance (appears only when content overflows)
 *  - Proper mobile density with rounded container preserved
 */
import { useRef, useState, useEffect, useCallback } from "react";
import { TabsList } from "./tabs";
import { cn } from "@/lib/utils";

interface Props extends React.ComponentProps<typeof TabsList> {}

export function ScrollableTabsList({ className, children, ...props }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const checkScroll = useCallback(() => {
    const el = wrapperRef.current?.querySelector<HTMLElement>(
      '[data-slot="tabs-list"]',
    );
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setShowLeftFade(scrollLeft > 2);
    setShowRightFade(scrollLeft < scrollWidth - clientWidth - 2);
  }, []);

  useEffect(() => {
    const el = wrapperRef.current?.querySelector<HTMLElement>(
      '[data-slot="tabs-list"]',
    );
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      ro.disconnect();
    };
  }, [checkScroll]);

  return (
    <div ref={wrapperRef} className="relative min-w-0">
      <TabsList
        className={cn(
          "flex gap-1 h-auto py-1 pl-1.5 w-auto overflow-x-auto scrollbar-hide",
          className,
        )}
        {...props}
      >
        {children}
        {/* Trailing spacer — ensures last tab has breathing room at scroll end */}
        <span className="min-w-3 shrink-0" aria-hidden="true" />
      </TabsList>
      {/* Dynamic edge fades — appear only when content overflows in that direction */}
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-6 rounded-l-lg",
          "bg-gradient-to-r from-muted to-transparent transition-opacity duration-150",
          showLeftFade ? "opacity-100" : "opacity-0",
        )}
        aria-hidden="true"
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-lg",
          "bg-gradient-to-l from-muted to-transparent transition-opacity duration-150",
          showRightFade ? "opacity-100" : "opacity-0",
        )}
        aria-hidden="true"
      />
    </div>
  );
}
