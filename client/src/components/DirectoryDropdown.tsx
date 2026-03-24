/**
 * DirectoryDropdown — Reusable employee directory picker
 *
 * A searchable dropdown that lists employees from the HR directory.
 * Scope-gated on the backend: each user sees only employees they have
 * access to (self → team → all) based on their HR role permissions.
 *
 * Designed for cross-module use — any module (workspace, automation,
 * agents, etc.) can import this component to select an employee.
 *
 * Usage:
 *   <DirectoryDropdown onSelect={(worker) => setAssignee(worker)} />
 *   <DirectoryDropdown onSelect={handleSelect} placeholder="Assign to..." />
 *   <DirectoryDropdown value={selectedId} onSelect={handleSelect} />
 */

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Search, Users, ChevronDown, X, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DirectoryEntry {
  workerId: number;
  displayName: string;
  primaryEmail: string;
  employeeNumber?: string | null;
  workerType: string;
  status: string;
}

export interface DirectoryDropdownProps {
  /** Called when an employee is selected */
  onSelect: (entry: DirectoryEntry) => void;
  /** Currently selected worker ID (controlled mode) */
  value?: number | null;
  /** Placeholder text when no selection */
  placeholder?: string;
  /** Filter to only show specific statuses (default: all) */
  statusFilter?: string;
  /** Filter to only show specific worker types (default: all) */
  workerTypeFilter?: string;
  /** Whether the dropdown is disabled */
  disabled?: boolean;
  /** Additional CSS classes for the trigger button */
  className?: string;
  /** Allow clearing the selection */
  clearable?: boolean;
  /** Called when selection is cleared */
  onClear?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DirectoryDropdown({
  onSelect,
  value,
  placeholder = "Select employee...",
  statusFilter,
  workerTypeFilter,
  disabled = false,
  className,
  clearable = false,
  onClear,
}: DirectoryDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Fetch directory list (scope-gated on backend)
  const listQuery = trpc.hr.directory.list.useQuery(
    {
      limit: 100,
      status: statusFilter,
      workerType: workerTypeFilter,
    },
    { staleTime: 30_000 },
  );

  // Search query (only when user types 2+ chars)
  const searchQuery = trpc.hr.directory.search.useQuery(
    { query: search, limit: 30 },
    { enabled: search.length >= 2 },
  );

  // Use search results when searching, otherwise full list
  const entries: DirectoryEntry[] = useMemo(() => {
    if (search.length >= 2) return (searchQuery.data as DirectoryEntry[]) ?? [];
    return (listQuery.data as DirectoryEntry[]) ?? [];
  }, [search, searchQuery.data, listQuery.data]);

  // Find selected entry for display
  const selectedEntry = useMemo(() => {
    if (value == null) return null;
    const all = (listQuery.data as DirectoryEntry[]) ?? [];
    return all.find((e) => e.workerId === value) ?? null;
  }, [value, listQuery.data]);

  const isLoading = listQuery.isLoading;

  function handleSelect(entry: DirectoryEntry) {
    onSelect(entry);
    setOpen(false);
    setSearch("");
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onClear?.();
    setSearch("");
  }

  const statusColor = (s: string) => {
    switch (s) {
      case "active": return "default" as const;
      case "on_leave": return "secondary" as const;
      case "terminated": return "destructive" as const;
      default: return "outline" as const;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "justify-between font-normal",
            !selectedEntry && "text-muted-foreground",
            className,
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <Users className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">
              {selectedEntry ? selectedEntry.displayName : placeholder}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {clearable && selectedEntry && (
              <X
                className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground"
                onClick={handleClear}
              />
            )}
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </div>
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[340px] p-0" align="start">
        {/* Search input */}
        <div className="flex items-center border-b px-3 py-2">
          <Search className="w-4 h-4 text-muted-foreground mr-2 flex-shrink-0" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-0 p-0 h-8 shadow-none focus-visible:ring-0"
          />
        </div>

        {/* Results list */}
        <div className="max-h-[280px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {search.length >= 2 ? "No matches found" : "No employees available"}
            </div>
          ) : (
            entries.map((entry) => (
              <button
                key={entry.workerId}
                onClick={() => handleSelect(entry)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                  "hover:bg-accent/50",
                  value === entry.workerId && "bg-accent",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{entry.displayName}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {entry.primaryEmail}
                  </div>
                </div>
                <Badge variant={statusColor(entry.status)} className="text-[10px] flex-shrink-0">
                  {entry.status}
                </Badge>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
