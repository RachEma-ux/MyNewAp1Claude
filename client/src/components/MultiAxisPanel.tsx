import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { EntryType } from "@shared/catalog-taxonomy";

interface MultiAxisPanelProps {
  entryType: EntryType;
  selectedNodeIds: number[];
  onSelectionChange: (ids: number[]) => void;
}

interface TreeNode {
  id: number;
  key: string;
  label: string;
  description: string | null;
  level: string;
  parentId: number | null;
  children: TreeNode[];
}

export function MultiAxisPanel({
  entryType,
  selectedNodeIds,
  onSelectionChange,
}: MultiAxisPanelProps) {
  const { data: nodes, isLoading } = trpc.catalogManage.taxonomyTree.useQuery(
    { entryType },
  );

  // Build tree from flat node list
  const axes = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];

    const nodeMap = new Map<number, TreeNode>();
    const roots: TreeNode[] = [];

    // Create TreeNode for each DB node
    for (const n of nodes) {
      nodeMap.set(n.id, {
        id: n.id,
        key: n.key,
        label: n.label,
        description: n.description,
        level: n.level,
        parentId: n.parentId,
        children: [],
      });
    }

    // Link children to parents
    for (const n of nodes) {
      const treeNode = nodeMap.get(n.id)!;
      if (n.parentId && nodeMap.has(n.parentId)) {
        nodeMap.get(n.parentId)!.children.push(treeNode);
      } else if (n.level === "axis") {
        roots.push(treeNode);
      }
    }

    return roots;
  }, [nodes]);

  // Track which axes are open (default: first one)
  const [openAxes, setOpenAxes] = useState<Set<number>>(new Set());

  function toggleAxis(axisId: number) {
    setOpenAxes((prev) => {
      const next = new Set(prev);
      if (next.has(axisId)) next.delete(axisId);
      else next.add(axisId);
      return next;
    });
  }

  // Radio behavior per axis: toggle class, replace within same axis
  function toggleClass(classNodeId: number, axisId: number) {
    // Find all class IDs under this axis
    const axis = axes.find((a) => a.id === axisId);
    if (!axis) return;

    const axisClassIds = new Set<number>();
    for (const child of axis.children) {
      if (child.level === "class") {
        axisClassIds.add(child.id);
      } else {
        // subcategory → collect its class children
        for (const cls of child.children) {
          axisClassIds.add(cls.id);
        }
      }
    }

    // Remove any existing selection for this axis, then toggle
    const filtered = selectedNodeIds.filter((id) => !axisClassIds.has(id));
    if (selectedNodeIds.includes(classNodeId)) {
      // Deselect
      onSelectionChange(filtered);
    } else {
      // Select this one
      onSelectionChange([...filtered, classNodeId]);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">Loading taxonomy...</span>
      </div>
    );
  }

  if (axes.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-2">
        No taxonomy data. Run seed first.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {axes.map((axis) => {
        const isOpen = openAxes.has(axis.id);
        // Find selected class label for this axis
        const selectedInAxis = axis.children.flatMap((child) =>
          child.level === "class"
            ? [child]
            : child.children
        ).find((cls) => selectedNodeIds.includes(cls.id));

        return (
          <Collapsible
            key={axis.id}
            open={isOpen}
            onOpenChange={() => toggleAxis(axis.id)}
          >
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-md hover:bg-muted/50 text-sm">
              <div className="flex items-center gap-2">
                <ChevronRight
                  className={`size-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
                />
                <span className="font-medium">{axis.label}</span>
              </div>
              {selectedInAxis && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0">
                  {selectedInAxis.label}
                </Badge>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-6 pr-2 pb-2">
              {axis.description && (
                <p className="text-xs text-muted-foreground mb-2">
                  {axis.description}
                </p>
              )}
              {axis.children[0]?.level === "class" ? (
                // 2-level: classes directly under axis
                <div className="flex flex-wrap gap-1.5">
                  {axis.children.map((cls) => {
                    const selected = selectedNodeIds.includes(cls.id);
                    return (
                      <Badge
                        key={cls.id}
                        variant={selected ? "default" : "outline"}
                        className={`text-xs cursor-pointer select-none ${
                          selected ? "" : "opacity-60 hover:opacity-100"
                        }`}
                        onClick={() => toggleClass(cls.id, axis.id)}
                      >
                        {cls.label}
                      </Badge>
                    );
                  })}
                </div>
              ) : (
                // 3-level: subcategories → classes
                <div className="space-y-2">
                  {axis.children.map((sub) => (
                    <div key={sub.id}>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        {sub.label}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {sub.children.map((cls) => {
                          const selected = selectedNodeIds.includes(cls.id);
                          return (
                            <Badge
                              key={cls.id}
                              variant={selected ? "default" : "outline"}
                              className={`text-xs cursor-pointer select-none ${
                                selected ? "" : "opacity-60 hover:opacity-100"
                              }`}
                              onClick={() => toggleClass(cls.id, axis.id)}
                            >
                              {cls.label}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
      {selectedNodeIds.length > 0 && (
        <p className="text-xs text-muted-foreground px-3 pt-1">
          {selectedNodeIds.length} classification{selectedNodeIds.length !== 1 ? "s" : ""} selected
        </p>
      )}
    </div>
  );
}
