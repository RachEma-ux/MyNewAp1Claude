/**
 * OM Structure Types Matrix — Full 5×10 matrix editor
 *
 * Rows = Attributes (10), Columns = Structure Types (5)
 * Each cell is editable. Saves via bulkUpsert.
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, ArrowLeft } from "lucide-react";

interface Props {
  workspaceId: number;
  matrixVersionId: number;
  onBack?: () => void;
}

export function OMStructureTypesMatrixPage({ workspaceId, matrixVersionId, onBack }: Props) {
  const utils = trpc.useUtils();
  const [editedCells, setEditedCells] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const types = trpc.organizationManagement.alignmentMatrix.types.list.useQuery({ workspaceId, matrixVersionId });
  const attributes = trpc.organizationManagement.alignmentMatrix.attributes.list.useQuery({ workspaceId, matrixVersionId });
  const cells = trpc.organizationManagement.alignmentMatrix.cells.list.useQuery({ workspaceId, matrixVersionId });
  const bulkUpsert = trpc.organizationManagement.alignmentMatrix.cells.bulkUpsert.useMutation();

  // Build cell map: `typeId-attrId` → valueText
  const cellMap: Record<string, string> = {};
  (cells.data ?? []).forEach((c: any) => {
    cellMap[`${c.typeId}-${c.attributeId}`] = c.valueText;
  });

  function getCellValue(typeId: number, attrId: number): string {
    const key = `${typeId}-${attrId}`;
    return editedCells[key] ?? cellMap[key] ?? "";
  }

  function setCellValue(typeId: number, attrId: number, value: string) {
    const key = `${typeId}-${attrId}`;
    setEditedCells(prev => ({ ...prev, [key]: value }));
  }

  const hasChanges = Object.keys(editedCells).length > 0;

  async function handleSave() {
    if (!hasChanges) return;
    setSaving(true);
    try {
      const cellsToSave = Object.entries(editedCells).map(([key, valueText]) => {
        const [typeId, attributeId] = key.split("-").map(Number);
        return { typeId, attributeId, valueText };
      });
      await bulkUpsert.mutateAsync({ workspaceId, matrixVersionId, cells: cellsToSave });
      setEditedCells({});
      await utils.organizationManagement.alignmentMatrix.cells.list.invalidate();
    } finally {
      setSaving(false);
    }
  }

  const isLoading = types.isLoading || attributes.isLoading || cells.isLoading;
  const typeList = types.data ?? [];
  const attrList = attributes.data ?? [];

  if (isLoading) {
    return <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading matrix...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <h2 className="text-lg font-semibold">Structure Types Matrix</h2>
          <Badge variant="outline" className="text-xs">v{matrixVersionId}</Badge>
        </div>
        <Button size="sm" onClick={handleSave} disabled={!hasChanges || saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
          Save Changes
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Edit cell values below. Rows are attributes, columns are structure types. Changes are saved in bulk.
      </p>

      {/* Matrix table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 border-b font-medium text-muted-foreground w-40">Attribute</th>
              {typeList.map((t: any) => (
                <th key={t.id} className="text-left p-2 border-b font-medium min-w-[180px]">{t.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attrList.map((attr: any) => (
              <tr key={attr.id} className="border-b border-border/50">
                <td className="p-2 font-medium text-muted-foreground align-top">{attr.label}</td>
                {typeList.map((t: any) => {
                  const key = `${t.id}-${attr.id}`;
                  const isEdited = key in editedCells;
                  return (
                    <td key={t.id} className="p-1 align-top">
                      <Textarea
                        className={`text-xs min-h-[60px] resize-y ${isEdited ? "border-amber-500/50" : ""}`}
                        value={getCellValue(t.id, attr.id)}
                        onChange={e => setCellValue(t.id, attr.id, e.target.value)}
                        rows={2}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {typeList.length === 0 && (
        <Card><CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">No structure types defined. The matrix should be seeded on startup.</p>
        </CardContent></Card>
      )}
    </div>
  );
}

export default OMStructureTypesMatrixPage;
