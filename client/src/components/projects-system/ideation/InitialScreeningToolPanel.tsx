/**
 * Step 7: Initial Screening (Filtering) — Tool Panel
 *
 * Step fields: screeningCriteria, promisingIdeaIds, deferredIdeaIds
 * Plus scoring grid for each idea against criteria.
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, Loader2, Filter } from "lucide-react";

interface Idea {
  id: number;
  title: string;
  isShortlisted: number;
}

interface ScreeningScore {
  id: number;
  ideaId: number;
  criterionKey: string;
  score: number;
  note: string | null;
}

interface Props {
  payload: Record<string, unknown> | null;
  ideas: Idea[];
  scores: ScreeningScore[];
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onSaveScore: (ideaId: number, criterionKey: string, score: number) => Promise<void>;
  disabled?: boolean;
}

const DEFAULT_CRITERIA = ["Strategic Fit", "Feasibility", "Impact", "Risk"];

export function InitialScreeningToolPanel({ payload, ideas, scores, onSave, onSaveScore, disabled }: Props) {
  const [screeningCriteria, setScreeningCriteria] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (payload) {
      setScreeningCriteria((payload.screeningCriteria as string) || DEFAULT_CRITERIA.join(", "));
    }
  }, [payload]);

  const criteria = screeningCriteria.split(",").map((c) => c.trim()).filter(Boolean);

  const handleSave = async () => {
    setSaving(true);
    try {
      const promisingIdeaIds = ideas.filter((i) => i.isShortlisted === 1).map((i) => i.id);
      const deferredIdeaIds = ideas.filter((i) => i.isShortlisted === 0).map((i) => i.id);
      await onSave({ screeningCriteria, promisingIdeaIds, deferredIdeaIds });
    } finally {
      setSaving(false);
    }
  };

  const getScore = (ideaId: number, criterion: string): number => {
    const s = scores.find((sc) => sc.ideaId === ideaId && sc.criterionKey === criterion);
    return s?.score ?? 0;
  };

  const getTotalScore = (ideaId: number): number => {
    return criteria.reduce((sum, c) => sum + getScore(ideaId, c), 0);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Filter className="w-4 h-4" />
          7. Initial Screening (Filtering)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Screening Criteria (comma-separated)</Label>
          <Input
            value={screeningCriteria}
            onChange={(e) => setScreeningCriteria(e.target.value)}
            placeholder="Strategic Fit, Feasibility, Impact, Risk"
            disabled={disabled}
          />
        </div>

        {ideas.length > 0 && criteria.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-1">Idea</th>
                  {criteria.map((c) => (
                    <th key={c} className="text-center p-1 min-w-[60px]">{c}</th>
                  ))}
                  <th className="text-center p-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {ideas.map((idea) => (
                  <tr key={idea.id} className="border-b">
                    <td className="p-1 max-w-[120px] truncate">{idea.title}</td>
                    {criteria.map((c) => (
                      <td key={c} className="text-center p-1">
                        <Input
                          type="number"
                          min={0}
                          max={10}
                          value={getScore(idea.id, c)}
                          onChange={(e) => onSaveScore(idea.id, c, parseInt(e.target.value) || 0)}
                          className="w-12 h-6 text-xs text-center p-0"
                          disabled={disabled}
                        />
                      </td>
                    ))}
                    <td className="text-center p-1 font-medium">{getTotalScore(idea.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Button onClick={handleSave} disabled={disabled || saving || !screeningCriteria.trim()} size="sm">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save Step
        </Button>
      </CardContent>
    </Card>
  );
}
