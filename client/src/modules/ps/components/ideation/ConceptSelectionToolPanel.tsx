/**
 * Step 10: Concept Selection — Tool Panel
 *
 * Fields: selectedIdeaId, rationale (strategicAlignment, expectedValue,
 * feasibility, riskProfile, stakeholderSupport), nextStep
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, Loader2, Target, CheckCircle2 } from "lucide-react";

interface Idea {
  id: number;
  title: string;
  description: string | null;
  isShortlisted: number;
  isSelected: number;
}

interface Props {
  payload: Record<string, unknown> | null;
  ideas: Idea[];
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onSelectIdea: (ideaId: number) => Promise<void>;
  disabled?: boolean;
}

export function ConceptSelectionToolPanel({ payload, onSave, ideas, onSelectIdea, disabled }: Props) {
  const [strategicAlignment, setStrategicAlignment] = useState("");
  const [expectedValue, setExpectedValue] = useState("");
  const [feasibility, setFeasibility] = useState("");
  const [riskProfile, setRiskProfile] = useState("");
  const [stakeholderSupport, setStakeholderSupport] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedIdea = ideas.find((i) => i.isSelected === 1);

  useEffect(() => {
    if (payload) {
      const rationale = (payload.rationale as Record<string, string>) || {};
      setStrategicAlignment(rationale.strategicAlignment || "");
      setExpectedValue(rationale.expectedValue || "");
      setFeasibility(rationale.feasibility || "");
      setRiskProfile(rationale.riskProfile || "");
      setStakeholderSupport(rationale.stakeholderSupport || "");
      setNextStep((payload.nextStep as string) || "");
    }
  }, [payload]);

  const handleSave = async () => {
    if (!selectedIdea) return;
    setSaving(true);
    try {
      await onSave({
        selectedIdeaId: selectedIdea.id,
        rationale: { strategicAlignment, expectedValue, feasibility, riskProfile, stakeholderSupport },
        nextStep,
      });
    } finally {
      setSaving(false);
    }
  };

  const shortlisted = ideas.filter((i) => i.isShortlisted === 1);
  const candidateIdeas = shortlisted.length > 0 ? shortlisted : ideas;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="w-4 h-4" />
          10. Concept Selection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Idea selection */}
        <div>
          <Label>Select the Winning Concept</Label>
          <div className="space-y-1 mt-1">
            {candidateIdeas.map((idea) => (
              <div
                key={idea.id}
                className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                  idea.isSelected === 1
                    ? "border-green-500 bg-green-500/10"
                    : "border-border hover:bg-accent/50"
                }`}
                onClick={() => !disabled && onSelectIdea(idea.id)}
              >
                {idea.isSelected === 1 ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-muted-foreground shrink-0" />
                )}
                <span className="text-sm flex-1">{idea.title}</span>
                {idea.isShortlisted === 1 && <Badge variant="outline" className="text-[10px]">Shortlisted</Badge>}
              </div>
            ))}
          </div>
        </div>

        {/* Rationale */}
        {selectedIdea && (
          <>
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-2">Selection Rationale</h4>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Strategic Alignment</Label>
                  <Textarea value={strategicAlignment} onChange={(e) => setStrategicAlignment(e.target.value)} rows={2} disabled={disabled} className="text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Expected Value</Label>
                  <Textarea value={expectedValue} onChange={(e) => setExpectedValue(e.target.value)} rows={2} disabled={disabled} className="text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Feasibility Assessment</Label>
                  <Textarea value={feasibility} onChange={(e) => setFeasibility(e.target.value)} rows={2} disabled={disabled} className="text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Risk Profile</Label>
                  <Textarea value={riskProfile} onChange={(e) => setRiskProfile(e.target.value)} rows={2} disabled={disabled} className="text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Stakeholder Support</Label>
                  <Textarea value={stakeholderSupport} onChange={(e) => setStakeholderSupport(e.target.value)} rows={2} disabled={disabled} className="text-xs" />
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs">Suggested Next Step</Label>
              <Textarea value={nextStep} onChange={(e) => setNextStep(e.target.value)} rows={2} disabled={disabled} className="text-xs" />
            </div>
            <Button onClick={handleSave} disabled={disabled || saving} size="sm">
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save Step
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
