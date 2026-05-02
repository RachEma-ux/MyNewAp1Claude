/**
 * Step 5: Idea Generation (Divergent) — Tool Panel
 *
 * Step fields: brainstormingMethod, participants, rawIdeaList
 * Plus inline add/list of ideas from the psIdeationIdeas table.
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, Loader2, Plus, Lightbulb, Trash2 } from "lucide-react";

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
  onAddIdea: (title: string, description?: string) => Promise<void>;
  disabled?: boolean;
}

export function IdeaGenerationToolPanel({ payload, ideas, onSave, onAddIdea, disabled }: Props) {
  const [brainstormingMethod, setBrainstormingMethod] = useState("");
  const [participants, setParticipants] = useState("");
  const [rawIdeaList, setRawIdeaList] = useState("");
  const [saving, setSaving] = useState(false);
  const [newIdeaTitle, setNewIdeaTitle] = useState("");
  const [newIdeaDesc, setNewIdeaDesc] = useState("");
  const [addingIdea, setAddingIdea] = useState(false);

  useEffect(() => {
    if (payload) {
      setBrainstormingMethod((payload.brainstormingMethod as string) || "");
      setParticipants((payload.participants as string) || "");
      setRawIdeaList((payload.rawIdeaList as string) || "");
    }
  }, [payload]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ brainstormingMethod, participants, rawIdeaList });
    } finally {
      setSaving(false);
    }
  };

  const handleAddIdea = async () => {
    if (!newIdeaTitle.trim()) return;
    setAddingIdea(true);
    try {
      await onAddIdea(newIdeaTitle.trim(), newIdeaDesc.trim() || undefined);
      setNewIdeaTitle("");
      setNewIdeaDesc("");
    } finally {
      setAddingIdea(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="w-4 h-4" />
          5. Idea Generation (Divergent)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Brainstorming Method</Label>
          <Input
            value={brainstormingMethod}
            onChange={(e) => setBrainstormingMethod(e.target.value)}
            placeholder="e.g., Brainwriting, SCAMPER, Reverse Brainstorm..."
            disabled={disabled}
          />
        </div>
        <div>
          <Label>Participants</Label>
          <Input
            value={participants}
            onChange={(e) => setParticipants(e.target.value)}
            placeholder="Who participated in ideation?"
            disabled={disabled}
          />
        </div>
        <div>
          <Label>Raw Idea Notes</Label>
          <Textarea
            value={rawIdeaList}
            onChange={(e) => setRawIdeaList(e.target.value)}
            placeholder="Free-form notes from the brainstorming session..."
            disabled={disabled}
            rows={3}
          />
        </div>
        <Button onClick={handleSave} disabled={disabled || saving || !brainstormingMethod.trim() || !participants.trim()} size="sm">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save Step
        </Button>

        {/* Add structured ideas */}
        <div className="border-t pt-4 space-y-3">
          <h4 className="text-sm font-medium">Structured Ideas ({ideas.length})</h4>
          <div className="flex gap-2">
            <Input
              value={newIdeaTitle}
              onChange={(e) => setNewIdeaTitle(e.target.value)}
              placeholder="Idea title..."
              disabled={disabled}
              className="flex-1"
            />
            <Button onClick={handleAddIdea} disabled={disabled || addingIdea || !newIdeaTitle.trim()} size="sm" variant="outline">
              {addingIdea ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </div>
          <Input
            value={newIdeaDesc}
            onChange={(e) => setNewIdeaDesc(e.target.value)}
            placeholder="Optional description..."
            disabled={disabled}
          />
          {ideas.length > 0 && (
            <div className="space-y-1">
              {ideas.map((idea) => (
                <div key={idea.id} className="flex items-center gap-2 px-2 py-1 rounded bg-muted/50 text-sm">
                  <span className="flex-1 truncate">{idea.title}</span>
                  {idea.isShortlisted === 1 && <Badge variant="outline" className="text-[10px]">Shortlisted</Badge>}
                  {idea.isSelected === 1 && <Badge className="text-[10px] bg-green-600">Selected</Badge>}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
