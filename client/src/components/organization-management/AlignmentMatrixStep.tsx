/**
 * AlignmentMatrixStep — Wizard Step 3: Matrix-driven structure type selection
 *
 * Fetches the active alignment matrix from DB, shows 5 structure type cards,
 * auto-populates attribute values when a type is selected, allows overrides.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Check, RotateCcw, Network, Building2, Grid3X3, Minimize2, Globe } from "lucide-react";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  functional: <Building2 className="w-5 h-5" />,
  divisional: <Network className="w-5 h-5" />,
  matrix: <Grid3X3 className="w-5 h-5" />,
  flat: <Minimize2 className="w-5 h-5" />,
  network: <Globe className="w-5 h-5" />,
};

interface Props {
  workspaceId: number;
  structureVersionId: number | null;
  selectedTypeCode: string | null;
  onTypeSelected: (typeCode: string, typeId: number) => void;
}

export function AlignmentMatrixStep({ workspaceId, structureVersionId, selectedTypeCode, onTypeSelected }: Props) {
  const utils = trpc.useUtils();
  const [applying, setApplying] = useState(false);

  const bootstrap = trpc.organizationManagement.alignmentMatrix.wizard.bootstrap.useQuery(
    { workspaceId, structureVersionId: structureVersionId ?? 0 },
    { enabled: true }
  );

  const applyDefaults = trpc.organizationManagement.alignmentMatrix.wizard.applyTypeDefaults.useMutation();
  const setOverride = trpc.organizationManagement.alignmentMatrix.wizard.setOverride.useMutation();
  const clearOverride = trpc.organizationManagement.alignmentMatrix.wizard.clearOverride.useMutation();

  const data = bootstrap.data;

  async function handleSelectType(typeCode: string, typeId: number) {
    if (!structureVersionId || !data?.activeMatrixVersion) return;
    setApplying(true);
    try {
      await applyDefaults.mutateAsync({
        workspaceId,
        structureVersionId,
        matrixVersionId: data.activeMatrixVersion.id,
        selectedTypeId: typeId,
      });
      onTypeSelected(typeCode, typeId);
      await utils.organizationManagement.alignmentMatrix.wizard.bootstrap.invalidate();
    } finally {
      setApplying(false);
    }
  }

  async function handleOverride(attributeId: number, value: string) {
    if (!structureVersionId || !data?.activeMatrixVersion) return;
    await setOverride.mutateAsync({
      workspaceId,
      structureVersionId,
      matrixVersionId: data.activeMatrixVersion.id,
      attributeId,
      selectedValueText: value,
    });
    await utils.organizationManagement.alignmentMatrix.wizard.bootstrap.invalidate();
  }

  async function handleClearOverride(attributeId: number) {
    if (!structureVersionId || !data?.activeMatrixVersion) return;
    await clearOverride.mutateAsync({
      workspaceId,
      structureVersionId,
      matrixVersionId: data.activeMatrixVersion.id,
      attributeId,
    });
    await utils.organizationManagement.alignmentMatrix.wizard.bootstrap.invalidate();
  }

  if (bootstrap.isLoading) {
    return <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading alignment matrix...</div>;
  }

  if (!data?.activeMatrixVersion) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No active alignment matrix found. Seed the matrix from Settings &gt; Wizard &gt; Structure Types Matrix.
      </div>
    );
  }

  if (!structureVersionId) {
    return (
      <div className="p-4 text-sm text-amber-500">
        Complete Step 1 first — a structure version must be created before selecting a structure type.
      </div>
    );
  }

  const types = data.types ?? [];
  const attributes = data.attributes ?? [];
  const selections = data.selections ?? [];
  const cellsByType = data.cellsByType ?? {};
  const optionsByAttribute = data.optionsByAttribute ?? {};

  return (
    <div className="space-y-6">
      {/* Structure Type Cards */}
      <div>
        <h4 className="text-sm font-medium mb-3">Select Structure Type</h4>
        <div className="grid gap-3">
          {types.map((t: any) => {
            const isSelected = selectedTypeCode === t.code || data.selectedTypeId === t.id;
            return (
              <button
                key={t.id}
                onClick={() => handleSelectType(t.code, t.id)}
                disabled={applying}
                className={`w-full text-left p-4 rounded-lg border transition-colors ${
                  isSelected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={isSelected ? "text-primary" : "text-muted-foreground"}>
                    {TYPE_ICONS[t.code] ?? <Network className="w-5 h-5" />}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{t.label}</p>
                    {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-primary" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Attribute Selections — shown after type is selected */}
      {(selectedTypeCode || data.selectedTypeId) && selections.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3">Alignment Attributes</h4>
          <div className="space-y-3">
            {attributes.map((attr: any) => {
              const sel = selections.find((s: any) => s.attributeId === attr.id);
              const options = optionsByAttribute[attr.id] ?? [];
              const isOverride = sel?.source === "manual_override";

              return (
                <Card key={attr.id} className={isOverride ? "border-amber-500/30" : ""}>
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{attr.label}</span>
                      {isOverride && (
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-xs text-amber-500">Override</Badge>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleClearOverride(attr.id)}>
                            <RotateCcw className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <Select
                      value={sel?.selectedValueText ?? ""}
                      onValueChange={(v) => handleOverride(attr.id, v)}
                    >
                      <SelectTrigger className="text-xs">
                        <SelectValue placeholder="Select value..." />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((opt: string, i: number) => (
                          <SelectItem key={i} value={opt} className="text-xs">{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {applying && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Applying defaults...
        </div>
      )}
    </div>
  );
}

export default AlignmentMatrixStep;
