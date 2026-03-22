/**
 * CatalogAvailableSelect — Base reusable select for Catalog-available assets.
 *
 * All per-type selectors delegate to this shared base. It renders a
 * consistent dropdown with search, loading, empty, and disabled states.
 *
 * This component reads ONLY from Catalog availability hooks.
 * It does NOT query raw source-domain tables.
 */

import { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, type LucideIcon } from "lucide-react";
import type { CatalogSelectorOption } from "@shared/catalog-selector-types";

export interface CatalogAvailableSelectProps {
  /** Options from the useCatalogAvailable* hook */
  options: CatalogSelectorOption[];
  /** Loading state */
  isLoading: boolean;
  /** Currently selected value (catalog entry ID as string) */
  value?: string;
  /** Callback when selection changes */
  onValueChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the select is disabled */
  disabled?: boolean;
  /** Optional icon for each item */
  icon?: LucideIcon;
  /** CSS class for the trigger */
  className?: string;
  /** Show category badge */
  showBadge?: boolean;
  /** Allow clearing the selection via a "None" option */
  allowNone?: boolean;
  /** Label for the none option */
  noneLabel?: string;
  /** Enable client-side search within the dropdown */
  searchable?: boolean;
}

export function CatalogAvailableSelect({
  options,
  isLoading,
  value,
  onValueChange,
  placeholder = "Select...",
  disabled,
  icon: Icon,
  className,
  showBadge = false,
  allowNone = false,
  noneLabel = "None",
  searchable = false,
}: CatalogAvailableSelectProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!searchable || !search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.description || "").toLowerCase().includes(q) ||
        (o.badge || "").toLowerCase().includes(q)
    );
  }, [options, search, searchable]);

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger className={className}>
          <Loader2 className="size-4 animate-spin mr-2" />
          <SelectValue placeholder="Loading..." />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {searchable && (
          <div className="px-2 pb-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-7 text-xs"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}

        {allowNone && (
          <SelectItem value="none">
            <span className="text-muted-foreground">{noneLabel}</span>
          </SelectItem>
        )}

        {filtered.map((option) => (
          <SelectItem
            key={option.id}
            value={String(option.id)}
            disabled={option.disabled}
          >
            <span className="flex items-center gap-2">
              {Icon && <Icon className="size-3.5 shrink-0" />}
              <span className="truncate">{option.label}</span>
              {showBadge && option.badge && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1 py-0 leading-tight ml-1"
                >
                  {option.badge}
                </Badge>
              )}
            </span>
          </SelectItem>
        ))}

        {filtered.length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            {options.length === 0
              ? "No available entries in Catalog"
              : "No matches found"}
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
