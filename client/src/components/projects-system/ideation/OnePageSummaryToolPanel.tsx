/**
 * Step 11: One-Page Summary (Optional) — Tool Panel
 *
 * Fields: theProblem, theOpportunity, topIdeas, scenariosExplored,
 * feasibilityInsights, selectedConcept, reasonForSelection, overrideText
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Save, Loader2, FileText } from "lucide-react";

interface Props {
  payload: Record<string, unknown> | null;
  autoSummary: string | null;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
}

export function OnePageSummaryToolPanel({ payload, autoSummary, onSave, disabled }: Props) {
  const [theProblem, setTheProblem] = useState("");
  const [theOpportunity, setTheOpportunity] = useState("");
  const [topIdeas, setTopIdeas] = useState("");
  const [scenariosExplored, setScenariosExplored] = useState("");
  const [feasibilityInsights, setFeasibilityInsights] = useState("");
  const [selectedConcept, setSelectedConcept] = useState("");
  const [reasonForSelection, setReasonForSelection] = useState("");
  const [overrideText, setOverrideText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (payload) {
      setTheProblem((payload.theProblem as string) || "");
      setTheOpportunity((payload.theOpportunity as string) || "");
      setTopIdeas((payload.topIdeas as string) || "");
      setScenariosExplored((payload.scenariosExplored as string) || "");
      setFeasibilityInsights((payload.feasibilityInsights as string) || "");
      setSelectedConcept((payload.selectedConcept as string) || "");
      setReasonForSelection((payload.reasonForSelection as string) || "");
      setOverrideText((payload.overrideText as string) || "");
    }
  }, [payload]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        theProblem, theOpportunity, topIdeas, scenariosExplored,
        feasibilityInsights, selectedConcept, reasonForSelection, overrideText,
      });
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { label: "The Problem", value: theProblem, set: setTheProblem },
    { label: "The Opportunity", value: theOpportunity, set: setTheOpportunity },
    { label: "Top Ideas", value: topIdeas, set: setTopIdeas },
    { label: "Scenarios Explored", value: scenariosExplored, set: setScenariosExplored },
    { label: "Feasibility Insights", value: feasibilityInsights, set: setFeasibilityInsights },
    { label: "Selected Concept", value: selectedConcept, set: setSelectedConcept },
    { label: "Reason for Selection", value: reasonForSelection, set: setReasonForSelection },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="w-4 h-4" />
          11. One-Page Summary (Optional)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Optional but recommended. Compose a concise summary of the ideation journey, or override with free-form text.
        </p>

        {autoSummary && (
          <div className="p-3 bg-muted/50 rounded text-xs">
            <div className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Auto-Generated Summary</div>
            <div className="whitespace-pre-wrap">{autoSummary}</div>
          </div>
        )}

        {fields.map(({ label, value, set }) => (
          <div key={label}>
            <Label className="text-xs">{label}</Label>
            <Textarea value={value} onChange={(e) => set(e.target.value)} rows={2} disabled={disabled} className="text-xs" />
          </div>
        ))}

        <div className="border-t pt-3">
          <Label className="text-xs">Override (free-form text replaces structured fields)</Label>
          <Textarea
            value={overrideText}
            onChange={(e) => setOverrideText(e.target.value)}
            rows={6}
            disabled={disabled}
            placeholder="Paste or write your own summary here to override the structured fields above..."
          />
        </div>

        <Button onClick={handleSave} disabled={disabled || saving} size="sm">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save Step
        </Button>
      </CardContent>
    </Card>
  );
}
