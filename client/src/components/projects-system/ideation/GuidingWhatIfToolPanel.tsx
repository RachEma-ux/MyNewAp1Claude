/**
 * Step 4: Guiding "What If?" Question — Tool Panel
 *
 * Fields: whatIf
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Save, Loader2, HelpCircle } from "lucide-react";

interface Props {
  payload: Record<string, unknown> | null;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
}

export function GuidingWhatIfToolPanel({ payload, onSave, disabled }: Props) {
  const [whatIf, setWhatIf] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (payload) {
      // Canonical key with backward-compat alias for older saved records
      setWhatIf((payload.whatIf as string) || (payload.whatIfQuestion as string) || "");
    }
  }, [payload]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ whatIf });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HelpCircle className="w-4 h-4" />
          4. Guiding "What If?" Question
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Frame the central "What If?" question that will guide ideation and exploration.
        </p>
        <div>
          <Label>What If...?</Label>
          <Textarea
            value={whatIf}
            onChange={(e) => setWhatIf(e.target.value)}
            placeholder='e.g., "What if we could reduce onboarding time from 3 months to 2 weeks?"'
            disabled={disabled}
            rows={4}
          />
        </div>
        <Button onClick={handleSave} disabled={disabled || saving || !whatIf.trim()} size="sm">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save Step
        </Button>
      </CardContent>
    </Card>
  );
}
