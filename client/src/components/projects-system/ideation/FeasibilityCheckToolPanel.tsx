/**
 * Step 9: Quick Feasibility Checks (Mini-POCs) — Tool Panel
 *
 * Step fields: notes
 * Plus per-idea feasibility checks from psIdeationFeasibilityChecks.
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, Loader2, FlaskConical, Plus } from "lucide-react";

interface Idea {
  id: number;
  title: string;
  isShortlisted: number;
}

interface FeasibilityCheck {
  id: number;
  ideaId: number;
  testPerformed: string;
  finding1: string | null;
  finding2: string | null;
  feasibilityRating: string;
  confidence: string | null;
  evidenceRef: string | null;
  notes: string | null;
}

interface Props {
  payload: Record<string, unknown> | null;
  ideas: Idea[];
  checks: FeasibilityCheck[];
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onUpsertCheck: (check: Partial<FeasibilityCheck> & { ideaId: number; testPerformed: string; feasibilityRating: string }) => Promise<void>;
  ideationId: number;
  disabled?: boolean;
}

const RATINGS = ["High", "Medium", "Low"] as const;
const RATING_COLORS: Record<string, string> = {
  High: "bg-green-500/10 text-green-600",
  Medium: "bg-yellow-500/10 text-yellow-600",
  Low: "bg-red-500/10 text-red-600",
};

export function FeasibilityCheckToolPanel({
  payload, ideas, checks, onSave, onUpsertCheck, ideationId, disabled,
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
          <FlaskConical className="w-4 h-4" />
          9. Quick Feasibility Checks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Feasibility Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="General feasibility assessment notes..."
            disabled={disabled}
            rows={2}
          />
        </div>
        <Button onClick={handleSave} disabled={disabled || saving} size="sm">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save Step
        </Button>

        <div className="border-t pt-4 space-y-3">
          <h4 className="text-sm font-medium">Per-Idea Feasibility</h4>
          {displayIdeas.map((idea) => {
            const ideaChecks = checks.filter((c) => c.ideaId === idea.id);
            const isExpanded = editingIdeaId === idea.id;
            return (
              <div key={idea.id} className="border rounded p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{idea.title}</span>
                  <div className="flex items-center gap-2">
                    {ideaChecks.length > 0 && (
                      <Badge className={RATING_COLORS[ideaChecks[0].feasibilityRating] || ""} variant="outline">
                        {ideaChecks[0].feasibilityRating}
                      </Badge>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setEditingIdeaId(isExpanded ? null : idea.id)} className="text-xs">
                      {isExpanded ? "Collapse" : "Check"}
                    </Button>
                  </div>
                </div>
                {isExpanded && (
                  <FeasibilityForm
                    existing={ideaChecks[0] || null}
                    ideaId={idea.id}
                    ideationId={ideationId}
                    onSave={onUpsertCheck}
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

function FeasibilityForm({
  existing, ideaId, ideationId, onSave, disabled,
}: {
  existing: FeasibilityCheck | null;
  ideaId: number;
  ideationId: number;
  onSave: (c: any) => Promise<void>;
  disabled?: boolean;
}) {
  const [testPerformed, setTestPerformed] = useState(existing?.testPerformed || "");
  const [finding1, setFinding1] = useState(existing?.finding1 || "");
  const [finding2, setFinding2] = useState(existing?.finding2 || "");
  const [rating, setRating] = useState(existing?.feasibilityRating || "Medium");
  const [confidence, setConfidence] = useState(existing?.confidence || "");
  const [evidenceRef, setEvidenceRef] = useState(existing?.evidenceRef || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        id: existing?.id,
        ideaId,
        testPerformed,
        finding1: finding1 || undefined,
        finding2: finding2 || undefined,
        feasibilityRating: rating,
        confidence: confidence || undefined,
        evidenceRef: evidenceRef || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 pl-2">
      <div>
        <Label className="text-xs">Test Performed</Label>
        <Input value={testPerformed} onChange={(e) => setTestPerformed(e.target.value)} disabled={disabled} className="text-xs" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Finding 1</Label>
          <Input value={finding1} onChange={(e) => setFinding1(e.target.value)} disabled={disabled} className="text-xs" />
        </div>
        <div>
          <Label className="text-xs">Finding 2</Label>
          <Input value={finding2} onChange={(e) => setFinding2(e.target.value)} disabled={disabled} className="text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Rating</Label>
          <select
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="w-full h-8 text-xs bg-background border rounded px-2"
            disabled={disabled}
          >
            {RATINGS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Confidence</Label>
          <Input value={confidence} onChange={(e) => setConfidence(e.target.value)} disabled={disabled} className="text-xs" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Evidence Reference</Label>
        <Input value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)} disabled={disabled} className="text-xs" />
      </div>
      <Button onClick={handleSave} disabled={disabled || saving || !testPerformed.trim()} size="sm" variant="outline">
        {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
        Save Check
      </Button>
    </div>
  );
}
