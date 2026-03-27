/**
 * Step 1: Context of the Project — Tool Panel
 *
 * Fields: externalDriver, internalDriver, triggerEvent, shapesNeed
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

export function ContextDefinitionToolPanel({ payload, onSave, disabled }: Props) {
  const [externalDriver, setExternalDriver] = useState("");
  const [internalDriver, setInternalDriver] = useState("");
  const [triggerEvent, setTriggerEvent] = useState("");
  const [shapesNeed, setShapesNeed] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (payload) {
      setExternalDriver((payload.externalDriver as string) || "");
      setInternalDriver((payload.internalDriver as string) || "");
      setTriggerEvent((payload.triggerEvent as string) || "");
      setShapesNeed((payload.shapesNeed as string) || "");
    }
  }, [payload]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ externalDriver, internalDriver, triggerEvent, shapesNeed });
    } finally {
      setSaving(false);
    }
  };

  const isValid = externalDriver.trim() && internalDriver.trim() && triggerEvent.trim() && shapesNeed.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">1. Context of the Project</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>External Driver</Label>
          <Textarea
            value={externalDriver}
            onChange={(e) => setExternalDriver(e.target.value)}
            placeholder="What external factor is pushing this project?"
            disabled={disabled}
            rows={2}
          />
        </div>
        <div>
          <Label>Internal Driver</Label>
          <Textarea
            value={internalDriver}
            onChange={(e) => setInternalDriver(e.target.value)}
            placeholder="What internal need does this address?"
            disabled={disabled}
            rows={2}
          />
        </div>
        <div>
          <Label>Trigger Event</Label>
          <Textarea
            value={triggerEvent}
            onChange={(e) => setTriggerEvent(e.target.value)}
            placeholder="What specific event triggered this initiative?"
            disabled={disabled}
            rows={2}
          />
        </div>
        <div>
          <Label>What Shapes the Need?</Label>
          <Textarea
            value={shapesNeed}
            onChange={(e) => setShapesNeed(e.target.value)}
            placeholder="What broader conditions shape this need?"
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
