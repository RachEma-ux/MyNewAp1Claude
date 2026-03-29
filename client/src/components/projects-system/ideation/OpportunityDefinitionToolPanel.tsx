/**
 * Step 3: The Opportunity — Tool Panel
 *
 * Fields: whatCouldBeImproved, whatValueCouldBeCreated, strategicAdvantage
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

export function OpportunityDefinitionToolPanel({ payload, onSave, disabled }: Props) {
  const [whatCouldBeImproved, setWhatCouldBeImproved] = useState("");
  const [whatValueCouldBeCreated, setWhatValueCouldBeCreated] = useState("");
  const [strategicAdvantage, setStrategicAdvantage] = useState("");
  const [saving, setSaving] = useState(false);

  const payloadKey = JSON.stringify(payload);

  useEffect(() => {
    if (payload) {
      // Canonical keys with backward-compat aliases for older saved records
      setWhatCouldBeImproved(
        (payload.whatCouldBeImproved as string) || (payload.opportunityStatement as string) || ""
      );
      setWhatValueCouldBeCreated((payload.whatValueCouldBeCreated as string) || "");
      setStrategicAdvantage((payload.strategicAdvantage as string) || "");
    }
  }, [payloadKey]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ whatCouldBeImproved, whatValueCouldBeCreated, strategicAdvantage });
    } finally {
      setSaving(false);
    }
  };

  const isValid = whatCouldBeImproved.trim() && whatValueCouldBeCreated.trim() && strategicAdvantage.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">3. The Opportunity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>What Could Be Improved?</Label>
          <Textarea
            value={whatCouldBeImproved}
            onChange={(e) => setWhatCouldBeImproved(e.target.value)}
            placeholder="What process, product, or capability could be enhanced?"
            disabled={disabled}
            rows={3}
          />
        </div>
        <div>
          <Label>What Value Could Be Created?</Label>
          <Textarea
            value={whatValueCouldBeCreated}
            onChange={(e) => setWhatValueCouldBeCreated(e.target.value)}
            placeholder="What new value would success unlock?"
            disabled={disabled}
            rows={2}
          />
        </div>
        <div>
          <Label>Strategic Advantage</Label>
          <Textarea
            value={strategicAdvantage}
            onChange={(e) => setStrategicAdvantage(e.target.value)}
            placeholder="How does this align with strategic goals?"
            disabled={disabled}
            rows={2}
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
