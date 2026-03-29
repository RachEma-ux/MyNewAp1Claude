/**
 * Step 1: Context of the Project — Tool Panel
 *
 * Fields match source-of-truth template wording:
 *   - External driver
 *   - Internal driver
 *   - Trigger event (Why now?)
 *   - How this shapes the need for a project
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
      const str = (v: unknown): string => {
        if (v == null) return "";
        if (typeof v === "string") return v;
        if (typeof v === "object") {
          const o = v as Record<string, unknown>;
          return String(o.signal || o.text || o.value || o.statement || JSON.stringify(v));
        }
        return String(v);
      };
      setExternalDriver(str(payload.externalDriver));
      setInternalDriver(str(payload.internalDriver));
      setTriggerEvent(str(payload.triggerEvent));
      setShapesNeed(str(payload.shapesNeed));
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
          <p className="text-[10px] text-muted-foreground mb-1">What external factor is driving the need for this project?</p>
          <Textarea
            value={externalDriver}
            onChange={(e) => setExternalDriver(e.target.value)}
            placeholder="Market shifts, regulatory changes, competitive pressure..."
            disabled={disabled}
            rows={2}
          />
        </div>
        <div>
          <Label>Internal Driver</Label>
          <p className="text-[10px] text-muted-foreground mb-1">What internal factor is driving the need for this project?</p>
          <Textarea
            value={internalDriver}
            onChange={(e) => setInternalDriver(e.target.value)}
            placeholder="Process inefficiency, strategic pivot, capability gap..."
            disabled={disabled}
            rows={2}
          />
        </div>
        <div>
          <Label>Trigger Event (Why now?)</Label>
          <p className="text-[10px] text-muted-foreground mb-1">What specific event or deadline triggered this initiative right now?</p>
          <Textarea
            value={triggerEvent}
            onChange={(e) => setTriggerEvent(e.target.value)}
            placeholder="Executive mandate, budget cycle, incident, opportunity window..."
            disabled={disabled}
            rows={2}
          />
        </div>
        <div>
          <Label>How This Shapes the Need for a Project</Label>
          <p className="text-[10px] text-muted-foreground mb-1">How do these drivers and trigger combine to justify initiating a project?</p>
          <Textarea
            value={shapesNeed}
            onChange={(e) => setShapesNeed(e.target.value)}
            placeholder="The convergence of these factors means that without a structured project..."
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
