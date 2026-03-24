/**
 * HRSideNav — Carbon Design System-inspired 3-level sidebar navigation
 *
 * Renders the HR module's 13 sections as an accordion with leaf items.
 * Consumes hrNavConfig.ts as source of truth, filters by role/permissions,
 * and integrates observability tracking.
 *
 * Levels:
 *   L0: "Human Resources" toggle (handled by MainLayout)
 *   L1: Sections — collapsible groups (accordion, one open at a time)
 *   L2: Leaf items — navigable links (only live/placeholder shown)
 */

import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { useHrRole } from "@/hooks/useHrRole";
import { HR_NAV_CONFIG, type HrNavItem, type HrNavSection } from "@/config/hrNavConfig";
import { getVisibleSections } from "@/lib/hrNavAuth";
import { trackSectionVisit, trackItemClick } from "@/lib/hrNavObservability";
import { resolveHrIcon } from "@/lib/hrIconMap";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HRSideNavProps {
  /** Called when a leaf item is clicked (e.g., to close mobile sidebar) */
  onNavigate?: () => void;
  /** CSS className for the root container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the navigable route for an item (prefer currentRoute for live pages) */
function getItemRoute(item: HrNavItem): string {
  return item.currentRoute ?? item.href;
}

/** Check if a nav item is active based on current path */
function isItemActive(item: HrNavItem, currentPath: string): boolean {
  const route = getItemRoute(item);
  return currentPath === route || currentPath.startsWith(route + "/");
}

/** Check if any item in a section is active */
function isSectionActive(section: HrNavSection, items: HrNavItem[], currentPath: string): boolean {
  return items.some((item) => isItemActive(item, currentPath));
}

/**
 * Filter items to only those shown in the sidebar:
 * - Must be live or placeholder (not "not-started" or "planned")
 */
function getSidebarItems(items: HrNavItem[]): HrNavItem[] {
  return items.filter(
    (item) => item.implementationStatus === "live" || item.implementationStatus === "placeholder",
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HRSideNav({ onNavigate, className }: HRSideNavProps) {
  const [location] = useLocation();
  const { allowedActions, isLoading } = useHrRole();

  // Convert Set<string> to string[] for hrNavAuth functions
  const actionsArray = useMemo(() => Array.from(allowedActions), [allowedActions]);

  // Get role-filtered sections with their visible items
  const visibleSections = useMemo(() => {
    return getVisibleSections(actionsArray)
      .map((section) => ({
        ...section,
        sidebarItems: getSidebarItems(section.visibleItems),
      }))
      .filter((section) => section.sidebarItems.length > 0);
  }, [actionsArray]);

  // Accordion state — only one section open at a time
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // Auto-expand the section containing the active route on mount/location change
  useEffect(() => {
    for (const section of visibleSections) {
      if (isSectionActive(section, section.sidebarItems, location)) {
        setExpandedSection(section.id);
        return;
      }
    }
  }, [location, visibleSections]);

  // Handle section toggle
  function handleSectionToggle(sectionId: string, isOpen: boolean) {
    if (isOpen) {
      setExpandedSection(sectionId);
      trackSectionVisit(sectionId);
    } else {
      setExpandedSection(null);
    }
  }

  // Handle item click
  function handleItemClick(sectionId: string, itemId: string) {
    trackItemClick(sectionId, itemId);
    onNavigate?.();
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={cn("space-y-1", className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 rounded bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <nav className={cn("space-y-0.5", className)} aria-label="HR Navigation">
      {visibleSections.map((section) => {
        const SectionIcon = resolveHrIcon(section.iconHint);
        const isExpanded = expandedSection === section.id;
        const hasActiveChild = isSectionActive(section, section.sidebarItems, location);

        return (
          <Collapsible
            key={section.id}
            open={isExpanded}
            onOpenChange={(open) => handleSectionToggle(section.id, open)}
          >
            {/* L1: Section header */}
            <CollapsibleTrigger
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 h-8 text-[13px] font-semibold transition-colors",
                "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                hasActiveChild && !isExpanded && "text-blue-500",
              )}
            >
              <SectionIcon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left truncate">{section.label}</span>
              <ChevronRight
                className={cn(
                  "w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200",
                  isExpanded && "rotate-90",
                )}
              />
            </CollapsibleTrigger>

            {/* L2: Leaf items */}
            <CollapsibleContent className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
              <div className="space-y-0.5 py-0.5">
                {section.sidebarItems.map((item) => {
                  const active = isItemActive(item, location);
                  const route = getItemRoute(item);

                  return (
                    <Link key={item.id} href={route}>
                      <a
                        onClick={() => handleItemClick(section.id, item.id)}
                        className={cn(
                          "flex items-center h-[30px] pl-8 pr-2 text-[13px] rounded-md transition-colors",
                          active
                            ? "border-l-2 border-blue-500 text-blue-500 bg-blue-500/5 font-medium"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                          item.implementationStatus === "placeholder" && "opacity-70",
                        )}
                      >
                        <span className="truncate">{item.label}</span>
                      </a>
                    </Link>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </nav>
  );
}
