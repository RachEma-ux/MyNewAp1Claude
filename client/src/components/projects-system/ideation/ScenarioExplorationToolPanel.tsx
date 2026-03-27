/**
 * Step 8: "What If?" Scenario Exploration — Tool Panel
 *
 * Step fields: notes
 * Plus per-idea scenario entries from psIdeationScenarios.
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Save, Loader2, GitBranch } from "lucide-react";

interface Idea {
  id: number;
  title: string;
  isShortlisted: number;
}

interface Scenario {
  id: number;
  ideaId: number;
  adoptionHighText: string | null;
  adoptionLowText: string | null;
  costIncreaseText: string | null;
  competitorReactionText: string | null;
  technologyLimitText: string | null;
  insightsText: string | null;
}

interface Props {
  payload: Record<string, unknown> | null;
  ideas: Idea[];
  scenarios: Scenario[];
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onUpsertScenario: (scenario: Partial<Scenario> & { ideaId: number }) => Promise<void>;
  ideationId: number;
  disabled?: boolean;
}

export function ScenarioExplorationToolPanel({
  payload, ideas, scenarios, onSave, onUpsertScenario, ideationId, disabled,
}: Props) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingIdeaId, setEditingIdeaId] = useState<number | null>(null);

  useEffect(() => {
    if (payload) {
      setNotes((payload.notes as string) || "");
    }
  }, [payload]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ notes });
    } finally {
      setSaving(false);
    }
  };

  const shortlisted = ideas.filter((i) => i.isShortlisted === 1);
  const displayIdeas = shortlisted.length > 0 ? shortlisted : ideas;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GitBranch className="w-4 h-4" />
          8. "What If?" Scenario Exploration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Scenario Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="General observations from scenario exploration..."
            disabled={disabled}
            rows={2}
          />
        </div>
        <Button onClick={handleSave} disabled={disabled || saving} size="sm">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save Step
        </Button>

        <div className="border-t pt-4 space-y-4">
          <h4 className="text-sm font-medium">Per-Idea Scenarios</h4>
          {displayIdeas.map((idea) => {
            const scenario = scenarios.find((s) => s.ideaId === idea.id);
            const isExpanded = editingIdeaId === idea.id;
            return (
              <div key={idea.id} className="border rounded p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{idea.title}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingIdeaId(isExpanded ? null : idea.id)}
                    className="text-xs"
                  >
                    {isExpanded ? "Collapse" : "Expand"}
                  </Button>
                </div>
                {isExpanded && (
                  <ScenarioForm
                    scenario={scenario || null}
                    ideaId={idea.id}
                    ideationId={ideationId}
                    onSave={onUpsertScenario}
                    disabled={disabled}
                  />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ScenarioForm({
  scenario, ideaId, ideationId, onSave, disabled,
}: {
  scenario: Scenario | null;
  ideaId: number;
  ideationId: number;
  onSave: (s: Partial<Scenario> & { ideaId: number }) => Promise<void>;
  disabled?: boolean;
}) {
  const [adoptionHigh, setAdoptionHigh] = useState(scenario?.adoptionHighText || "");
  const [adoptionLow, setAdoptionLow] = useState(scenario?.adoptionLowText || "");
  const [costIncrease, setCostIncrease] = useState(scenario?.costIncreaseText || "");
  const [competitor, setCompetitor] = useState(scenario?.competitorReactionText || "");
  const [techLimit, setTechLimit] = useState(scenario?.technologyLimitText || "");
  const [insights, setInsights] = useState(scenario?.insightsText || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        id: scenario?.id,
        ideaId,
        adoptionHighText: adoptionHigh,
        adoptionLowText: adoptionLow,
        costIncreaseText: costIncrease,
        competitorReactionText: competitor,
        technologyLimitText: techLimit,
        insightsText: insights,
      });
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { label: "If adoption is high?", value: adoptionHigh, set: setAdoptionHigh },
    { label: "If adoption is low?", value: adoptionLow, set: setAdoptionLow },
    { label: "If costs increase?", value: costIncrease, set: setCostIncrease },
    { label: "If a competitor reacts?", value: competitor, set: setCompetitor },
    { label: "If technology hits a limit?", value: techLimit, set: setTechLimit },
    { label: "Key Insights", value: insights, set: setInsights },
  ];

  return (
    <div className="space-y-2 pl-2">
      {fields.map(({ label, value, set }) => (
        <div key={label}>
          <Label className="text-xs">{label}</Label>
          <Textarea value={value} onChange={(e) => set(e.target.value)} rows={1} disabled={disabled} className="text-xs" />
        </div>
      ))}
      <Button onClick={handleSave} disabled={disabled || saving} size="sm" variant="outline">
        {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
        Save Scenario
      </Button>
    </div>
  );
}
