/**
 * Step 2: The Problem — Tool Panel
 *
 * Fields: whatIsNotWorking, whoIsImpacted, consequencesOfDoingNothing
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Save, Loader2 } from "lucide-react";

interface Props {
  payload: Record<string, unknown> | null;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
}

export function ProblemDefinitionToolPanel({ payload, onSave, disabled }: Props) {
  const [whatIsNotWorking, setWhatIsNotWorking] = useState("");
  const [whoIsImpacted, setWhoIsImpacted] = useState("");
  const [consequencesOfDoingNothing, setConsequencesOfDoingNothing] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (payload) {
      setWhatIsNotWorking((payload.whatIsNotWorking as string) || "");
      setWhoIsImpacted((payload.whoIsImpacted as string) || "");
      setConsequencesOfDoingNothing((payload.consequencesOfDoingNothing as string) || "");
    }
  }, [payload]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ whatIsNotWorking, whoIsImpacted, consequencesOfDoingNothing });
    } finally {
      setSaving(false);
    }
  };

  const isValid = whatIsNotWorking.trim() && whoIsImpacted.trim() && consequencesOfDoingNothing.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">2. The Problem</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>What Is Not Working?</Label>
          <Textarea
            value={whatIsNotWorking}
            onChange={(e) => setWhatIsNotWorking(e.target.value)}
            placeholder="Describe the current pain point or dysfunction..."
            disabled={disabled}
            rows={3}
          />
        </div>
        <div>
          <Label>Who Is Impacted?</Label>
          <Textarea
            value={whoIsImpacted}
            onChange={(e) => setWhoIsImpacted(e.target.value)}
            placeholder="Which stakeholders, teams, or users are affected?"
            disabled={disabled}
            rows={2}
          />
        </div>
        <div>
          <Label>Consequences of Doing Nothing</Label>
          <Textarea
            value={consequencesOfDoingNothing}
            onChange={(e) => setConsequencesOfDoingNothing(e.target.value)}
            placeholder="What happens if this problem is not addressed?"
            disabled={disabled}
            rows={3}
          />
        </div>
        <Button onClick={handleSave} disabled={disabled || saving || !isValid} size="sm">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save Step
        </Button>
      </CardContent>
    </Card>
  );
}
