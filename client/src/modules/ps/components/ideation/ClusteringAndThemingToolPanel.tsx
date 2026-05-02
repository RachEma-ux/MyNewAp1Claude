/**
 * Step 6: Idea Clustering & Theming — Tool Panel
 *
 * Step fields: patternsObserved
 * Plus manage themes and assign ideas to themes.
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, Loader2, Plus, Layers } from "lucide-react";

interface Theme {
  id: number;
  label: string;
  patternNotes: string | null;
  sortOrder: number;
}

interface Idea {
  id: number;
  title: string;
  themeId: number | null;
}

interface Props {
  payload: Record<string, unknown> | null;
  themes: Theme[];
  ideas: Idea[];
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onUpsertTheme: (label: string, patternNotes?: string) => Promise<void>;
  onAssignIdea: (ideaId: number, themeId: number | null) => Promise<void>;
  ideationId: number;
  disabled?: boolean;
}

export function ClusteringAndThemingToolPanel({
  payload, themes, ideas, onSave, onUpsertTheme, onAssignIdea, ideationId, disabled,
}: Props) {
  const [patternsObserved, setPatternsObserved] = useState("");
  const [saving, setSaving] = useState(false);
  const [newThemeLabel, setNewThemeLabel] = useState("");
  const [addingTheme, setAddingTheme] = useState(false);

  useEffect(() => {
    if (payload) {
      setPatternsObserved((payload.patternsObserved as string) || "");
    }
  }, [payload]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ patternsObserved });
    } finally {
      setSaving(false);
    }
  };

  const handleAddTheme = async () => {
    if (!newThemeLabel.trim()) return;
    setAddingTheme(true);
    try {
      await onUpsertTheme(newThemeLabel.trim());
      setNewThemeLabel("");
    } finally {
      setAddingTheme(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="w-4 h-4" />
          6. Idea Clustering & Theming
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Patterns Observed</Label>
          <Textarea
            value={patternsObserved}
            onChange={(e) => setPatternsObserved(e.target.value)}
            placeholder="What patterns or clusters emerge from the ideas?"
            disabled={disabled}
            rows={3}
          />
        </div>
        <Button onClick={handleSave} disabled={disabled || saving} size="sm">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save Step
        </Button>

        {/* Theme management */}
        <div className="border-t pt-4 space-y-3">
          <h4 className="text-sm font-medium">Themes ({themes.length})</h4>
          <div className="flex gap-2">
            <Input
              value={newThemeLabel}
              onChange={(e) => setNewThemeLabel(e.target.value)}
              placeholder="New theme label..."
              disabled={disabled}
              className="flex-1"
            />
            <Button onClick={handleAddTheme} disabled={disabled || addingTheme || !newThemeLabel.trim()} size="sm" variant="outline">
              {addingTheme ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </div>

          {themes.map((theme) => {
            const themeIdeas = ideas.filter((i) => i.themeId === theme.id);
            return (
              <div key={theme.id} className="p-2 rounded bg-muted/50 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{theme.label}</Badge>
                  <span className="text-xs text-muted-foreground">{themeIdeas.length} ideas</span>
                </div>
                {themeIdeas.map((idea) => (
                  <div key={idea.id} className="text-xs pl-4 text-muted-foreground">{idea.title}</div>
                ))}
              </div>
            );
          })}

          {/* Unassigned ideas */}
          {ideas.filter((i) => !i.themeId).length > 0 && (
            <div className="p-2 rounded bg-muted/30 space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Unassigned</div>
              {ideas.filter((i) => !i.themeId).map((idea) => (
                <div key={idea.id} className="flex items-center gap-2 text-xs pl-4">
                  <span className="flex-1">{idea.title}</span>
                  {themes.length > 0 && (
                    <select
                      className="text-xs bg-background border rounded px-1"
                      disabled={disabled}
                      onChange={(e) => {
                        const themeId = e.target.value ? Number(e.target.value) : null;
                        onAssignIdea(idea.id, themeId);
                      }}
                      defaultValue=""
                    >
                      <option value="">Assign...</option>
                      {themes.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
