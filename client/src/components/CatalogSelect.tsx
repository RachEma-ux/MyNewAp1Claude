import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Server, Brain, Package, Workflow, Bot, Plus, type LucideIcon } from "lucide-react";
import { ENTRY_TYPE_DEFS, type EntryType } from "@shared/catalog-taxonomy";
import { useCatalogEntries } from "@/hooks/useCatalogEntries";

const TYPE_ICONS: Record<EntryType, LucideIcon> = {
  provider: Server,
  llm: Brain,
  model: Package,
  agent: Workflow,
  bot: Bot,
};

interface CatalogSelectProps {
  entryType?: EntryType | EntryType[];
  category?: string;
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showTypeIcon?: boolean;
  showCategory?: boolean;
  /** Filter entries by matching tag or config.providerId */
  linkedProvider?: string;
  /** Which field to use as the select value: "id" (default) or "name" */
  valueField?: "id" | "name";
  /** Show a "Custom..." option at the bottom that triggers this callback */
  onCustom?: () => void;
}

export function CatalogSelect({
  entryType,
  category,
  value,
  onValueChange,
  placeholder = "Select entry...",
  disabled,
  className,
  showTypeIcon = true,
  showCategory = false,
  linkedProvider,
  valueField = "id",
  onCustom,
}: CatalogSelectProps) {
  // When filtering by a single type, pass it to the hook; otherwise fetch all
  const singleType = typeof entryType === "string" ? entryType : undefined;
  const { entries, isLoading } = useCatalogEntries(
    singleType || category ? { entryType: singleType, category } : undefined
  );

  // Client-side filter for multi-type arrays + linked provider, sorted alphabetically
  const filtered = useMemo(() => {
    let list = Array.isArray(entryType)
      ? entries.filter((e) => (entryType as EntryType[]).includes(e.entryType as EntryType))
      : entries;

    // Filter by linked provider (match tags or config.providerId)
    if (linkedProvider) {
      const key = linkedProvider.toLowerCase();
      list = list.filter((e) => {
        const tags = (e.tags as string[] | null) ?? [];
        const configProvider = (e.config as any)?.providerId ?? "";
        return tags.some((t) => t.toLowerCase() === key) || configProvider.toLowerCase() === key;
      });
    }

    return [...list].sort((a, b) =>
      (a.displayName || a.name).localeCompare(b.displayName || b.name)
    );
  }, [entries, entryType, linkedProvider]);

  // Group entries by type when showing multiple types
  const grouped = useMemo(() => {
    const showMultipleTypes = !singleType;
    if (!showMultipleTypes) return null;

    const groups: Record<string, typeof filtered> = {};
    for (const entry of filtered) {
      const type = entry.entryType;
      if (!groups[type]) groups[type] = [];
      groups[type].push(entry);
    }
    return groups;
  }, [filtered, singleType]);

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

  const handleValueChange = (val: string) => {
    if (val === "__custom__" && onCustom) {
      onCustom();
      return;
    }
    onValueChange(val);
  };

  return (
    <Select value={value} onValueChange={handleValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {grouped ? (
          // Multiple types: render grouped
          Object.entries(grouped).map(([type, items], groupIdx) => {
            const Icon = TYPE_ICONS[type as EntryType];
            const typeDef = ENTRY_TYPE_DEFS[type as EntryType];
            return (
              <SelectGroup key={type}>
                {groupIdx > 0 && <SelectSeparator />}
                <SelectLabel className="flex items-center gap-1.5">
                  {Icon && <Icon className="size-3.5" />}
                  {typeDef?.label ?? type}
                </SelectLabel>
                {items.map((entry) => (
                  <SelectItem key={entry.id} value={valueField === "name" ? entry.name : String(entry.id)}>
                    <span className="flex items-center gap-2">
                      {entry.displayName || entry.name}
                      {showCategory && entry.category && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 leading-tight">
                          {entry.category}
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            );
          })
        ) : (
          // Single type: flat list
          filtered.map((entry) => {
            const Icon = showTypeIcon ? TYPE_ICONS[entry.entryType as EntryType] : null;
            return (
              <SelectItem key={entry.id} value={valueField === "name" ? entry.name : String(entry.id)}>
                <span className="flex items-center gap-2">
                  {Icon && <Icon className="size-3.5" />}
                  {entry.displayName || entry.name}
                  {showCategory && entry.category && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 leading-tight">
                      {entry.category}
                    </Badge>
                  )}
                </span>
              </SelectItem>
            );
          })
        )}
        {filtered.length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No entries found
          </div>
        )}
        {onCustom && (
          <>
            <SelectSeparator />
            <SelectItem value="__custom__">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Plus className="size-3.5" />
                Custom...
              </span>
            </SelectItem>
          </>
        )}
      </SelectContent>
    </Select>
  );
}
