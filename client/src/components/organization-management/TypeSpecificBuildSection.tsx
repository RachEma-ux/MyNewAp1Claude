/**
 * TypeSpecificBuildSection — Wizard Step 4: Contextual org unit creation
 *
 * Renders type-aware guidance and default org unit templates based on
 * the structure type selected in Step 3 (Alignment Matrix).
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Plus, Trash2, Info } from "lucide-react";

interface OrgUnitDraft {
  code: string;
  name: string;
  type: string;
  parentIndex?: number;
}

interface Props {
  structureType: string | null;
  orgUnits: OrgUnitDraft[];
  onOrgUnitsChange: (units: OrgUnitDraft[]) => void;
}

const TYPE_GUIDANCE: Record<string, { title: string; description: string; suggestedUnits: OrgUnitDraft[] }> = {
  functional: {
    title: "Functional Structure Build",
    description: "Organize by business function. Each department is a center of expertise with a single reporting line.",
    suggestedUnits: [
      { code: "ENG", name: "Engineering", type: "department" },
      { code: "MKT", name: "Marketing", type: "department" },
      { code: "FIN", name: "Finance", type: "department" },
      { code: "HR", name: "Human Resources", type: "department" },
      { code: "OPS", name: "Operations", type: "department" },
    ],
  },
  divisional: {
    title: "Divisional Structure Build",
    description: "Organize by product line, geography, or customer segment. Each division operates semi-independently.",
    suggestedUnits: [
      { code: "DIV-PROD-A", name: "Product A Division", type: "division" },
      { code: "DIV-PROD-B", name: "Product B Division", type: "division" },
      { code: "DIV-INTL", name: "International Division", type: "division" },
    ],
  },
  matrix: {
    title: "Matrix Structure Build",
    description: "Dual reporting structure: functional departments plus project/product teams. Employees report to both.",
    suggestedUnits: [
      { code: "FUNC-ENG", name: "Engineering (Functional)", type: "department" },
      { code: "FUNC-MKT", name: "Marketing (Functional)", type: "department" },
      { code: "PROJ-ALPHA", name: "Project Alpha", type: "team" },
      { code: "PROJ-BETA", name: "Project Beta", type: "team" },
    ],
  },
  flat: {
    title: "Flat Structure Build",
    description: "Minimal hierarchy with wide spans of control. Direct-to-CEO or peer accountability model.",
    suggestedUnits: [
      { code: "CORE", name: "Core Team", type: "team" },
      { code: "GROWTH", name: "Growth Squad", type: "team" },
      { code: "PRODUCT", name: "Product Squad", type: "team" },
    ],
  },
  network: {
    title: "Network Structure Build",
    description: "Core team manages external partners. Focus on brand innovation with lean operations.",
    suggestedUnits: [
      { code: "CORE-HQ", name: "Core HQ", type: "business_unit" },
      { code: "PARTNER-DEV", name: "Dev Partner Network", type: "group" },
      { code: "PARTNER-MFG", name: "Manufacturing Partner", type: "group" },
    ],
  },
};

const ORG_UNIT_TYPES = ["department", "division", "team", "business_unit", "group"];

export function TypeSpecificBuildSection({ structureType, orgUnits, onOrgUnitsChange }: Props) {
  const guidance = structureType ? TYPE_GUIDANCE[structureType] : null;

  function addUnit() {
    onOrgUnitsChange([...orgUnits, { code: "", name: "", type: "department" }]);
  }

  function removeUnit(index: number) {
    onOrgUnitsChange(orgUnits.filter((_, i) => i !== index));
  }

  function updateUnit(index: number, field: keyof OrgUnitDraft, value: string | number | undefined) {
    const next = [...orgUnits];
    next[index] = { ...next[index], [field]: value };
    onOrgUnitsChange(next);
  }

  function applySuggested() {
    if (!guidance) return;
    onOrgUnitsChange([...orgUnits, ...guidance.suggestedUnits]);
  }

  if (!structureType) {
    return (
      <div className="p-4 text-sm text-amber-500">
        Select a structure type in Step 3 before building org units.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Type-specific guidance banner */}
      {guidance && (
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">{guidance.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{guidance.description}</p>
                {orgUnits.length === 0 && (
                  <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={applySuggested}>
                    <Plus className="w-3 h-3 mr-1" /> Add Suggested Units
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Org unit list */}
      {orgUnits.map((u, i) => (
        <Card key={i}>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <Label className="text-xs">Code</Label>
                <Input value={u.code} onChange={e => updateUnit(i, "code", e.target.value)} placeholder="ENG-001" />
              </div>
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={u.name} onChange={e => updateUnit(i, "name", e.target.value)} placeholder="Engineering" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={u.type} onValueChange={v => updateUnit(i, "type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ORG_UNIT_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {i > 0 && (
                <div>
                  <Label className="text-xs">Parent</Label>
                  <Select
                    value={u.parentIndex?.toString() ?? ""}
                    onValueChange={v => updateUnit(i, "parentIndex", v ? parseInt(v) : undefined)}
                  >
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      {orgUnits.slice(0, i).map((p, pi) => (
                        <SelectItem key={pi} value={pi.toString()}>{p.name || `Unit ${pi + 1}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <Button variant="ghost" size="sm" className="mt-2 text-xs text-destructive" onClick={() => removeUnit(i)}>
              <Trash2 className="w-3 h-3 mr-1" /> Remove
            </Button>
          </CardContent>
        </Card>
      ))}

      <Button variant="outline" onClick={addUnit}>
        <Building2 className="w-4 h-4 mr-1" /> Add Org Unit
      </Button>
    </div>
  );
}

export default TypeSpecificBuildSection;
