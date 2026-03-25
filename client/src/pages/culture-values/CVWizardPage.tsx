/**
 * CV Wizard — 6-step culture values definition wizard
 *
 * Steps:
 * 1. Value Set Context — name, description
 * 2. Core Values (3–7) — define core/aspirational/operational values
 * 3. Non-negotiables & Red Flags — define boundaries per value
 * 4. Value Translation — unit-level contextualization
 * 5. Operationalization — review criteria, onboarding, surveys
 * 6. Validation & Publish — readiness check and publish
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ModuleWizardShell, type WizardStep } from "@/components/wizard/ModuleWizardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Heart, Shield, Globe, Cog, CheckCircle, XCircle, AlertTriangle,
} from "lucide-react";

interface ValueDef {
  code: string;
  name: string;
  description: string;
  type: "core" | "aspirational" | "operational";
  behaviors: { behavior: string; level: "standard" | "exemplary" | "minimum" }[];
  nonNegotiables: { description: string; severity: "critical" | "high" | "medium"; category: "red_flag" | "anti_pattern" | "violation" }[];
  translations: { unitType: string; unitIdentifier: string; translation: string }[];
}

interface CVDraft {
  name: string;
  description: string;
  values: ValueDef[];
  operationalization: {
    type: "review_criteria" | "onboarding_checklist" | "bars_scale" | "survey_question" | "recognition_criteria";
    name: string;
    description: string;
  }[];
}

const EMPTY_DRAFT: CVDraft = {
  name: "", description: "", values: [], operationalization: [],
};

function emptyValue(): ValueDef {
  return { code: "", name: "", description: "", type: "core", behaviors: [], nonNegotiables: [], translations: [] };
}

export function CVWizardPage({ workspaceId }: { workspaceId: number }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [draft, setDraft] = useState<CVDraft>({ ...EMPTY_DRAFT });
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);

  const createValueSet = trpc.cultureValues.valueSets.create.useMutation();
  const createDefinition = trpc.cultureValues.definitions.create.useMutation();
  const createBehavior = trpc.cultureValues.behaviors.create.useMutation();
  const createNonNeg = trpc.cultureValues.nonNegotiables.create.useMutation();
  const createTranslation = trpc.cultureValues.translations.create.useMutation();
  const createOps = trpc.cultureValues.operationalization.create.useMutation();
  const publishSet = trpc.cultureValues.valueSets.publish.useMutation();

  const steps: WizardStep[] = [
    { id: "context", label: "Value Set Context", description: "Name your value set and describe its purpose", isValid: !!draft.name },
    { id: "values", label: "Core Values (3–7)", description: "Define your core, aspirational, and operational values with behaviors", isValid: draft.values.length >= 3 && draft.values.length <= 7 && draft.values.every(v => v.code && v.name) },
    { id: "non-negotiables", label: "Non-negotiables & Red Flags", description: "Define boundaries and anti-patterns for each value", isValid: draft.values.some(v => v.nonNegotiables.length > 0) },
    { id: "translations", label: "Value Translation", description: "Contextualize values for different teams and units", isValid: draft.values.some(v => v.translations.length > 0) },
    { id: "operationalization", label: "Operationalization", description: "Create review criteria, onboarding checklists, and survey questions", isValid: draft.operationalization.length > 0 },
    { id: "publish", label: "Validation & Publish", description: "Review readiness and publish the value set", isValid: false },
  ];

  const set = <K extends keyof CVDraft>(key: K, val: CVDraft[K]) =>
    setDraft(d => ({ ...d, [key]: val }));

  function updateValue(i: number, field: string, val: any) {
    const next = [...draft.values];
    next[i] = { ...next[i], [field]: val };
    set("values", next);
  }

  function addBehavior(vi: number) {
    const next = [...draft.values];
    next[vi] = { ...next[vi], behaviors: [...next[vi].behaviors, { behavior: "", level: "standard" }] };
    set("values", next);
  }

  function updateBehavior(vi: number, bi: number, field: string, val: string) {
    const next = [...draft.values];
    const behaviors = [...next[vi].behaviors];
    behaviors[bi] = { ...behaviors[bi], [field]: val };
    next[vi] = { ...next[vi], behaviors };
    set("values", next);
  }

  function addNonNeg(vi: number) {
    const next = [...draft.values];
    next[vi] = { ...next[vi], nonNegotiables: [...next[vi].nonNegotiables, { description: "", severity: "critical", category: "red_flag" }] };
    set("values", next);
  }

  function updateNonNeg(vi: number, ni: number, field: string, val: string) {
    const next = [...draft.values];
    const nns = [...next[vi].nonNegotiables];
    nns[ni] = { ...nns[ni], [field]: val };
    next[vi] = { ...next[vi], nonNegotiables: nns };
    set("values", next);
  }

  function addTranslation(vi: number) {
    const next = [...draft.values];
    next[vi] = { ...next[vi], translations: [...next[vi].translations, { unitType: "", unitIdentifier: "", translation: "" }] };
    set("values", next);
  }

  function updateTranslation(vi: number, ti: number, field: string, val: string) {
    const next = [...draft.values];
    const trans = [...next[vi].translations];
    trans[ti] = { ...trans[ti], [field]: val };
    next[vi] = { ...next[vi], translations: trans };
    set("values", next);
  }

  function addOps() {
    set("operationalization", [...draft.operationalization, { type: "review_criteria", name: "", description: "" }]);
  }

  function updateOps(i: number, field: string, val: string) {
    const next = [...draft.operationalization];
    next[i] = { ...next[i], [field]: val };
    set("operationalization", next);
  }

  // ── Publish Flow ──
  async function handlePublish() {
    setPublishing(true);
    setPublishResult(null);
    try {
      // 1. Create value set
      const valueSet = await createValueSet.mutateAsync({
        workspaceId, name: draft.name, description: draft.description,
      });

      // 2. Create definitions + behaviors + non-negotiables + translations
      for (let vi = 0; vi < draft.values.length; vi++) {
        const v = draft.values[vi];
        const def = await createDefinition.mutateAsync({
          workspaceId, valueSetId: valueSet.id,
          code: v.code, name: v.name, description: v.description, type: v.type,
          sortOrder: vi,
        });

        for (const b of v.behaviors) {
          if (b.behavior) {
            await createBehavior.mutateAsync({
              workspaceId, valueDefinitionId: def.id,
              behavior: b.behavior, level: b.level,
            });
          }
        }

        for (const nn of v.nonNegotiables) {
          if (nn.description) {
            await createNonNeg.mutateAsync({
              workspaceId, valueDefinitionId: def.id,
              description: nn.description, severity: nn.severity, category: nn.category,
            });
          }
        }

        for (const t of v.translations) {
          if (t.translation && t.unitType && t.unitIdentifier) {
            await createTranslation.mutateAsync({
              workspaceId, valueDefinitionId: def.id,
              unitType: t.unitType, unitIdentifier: t.unitIdentifier, translation: t.translation,
            });
          }
        }
      }

      // 3. Create operationalization templates
      for (const op of draft.operationalization) {
        if (op.name) {
          await createOps.mutateAsync({
            workspaceId, valueSetId: valueSet.id,
            type: op.type, name: op.name, description: op.description,
          });
        }
      }

      // 4. Publish
      await publishSet.mutateAsync({ workspaceId, id: valueSet.id });

      setPublishResult("success");
    } catch (err: any) {
      setPublishResult(err.message || "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  // ── Validation ──
  const validationIssues: string[] = [];
  if (!draft.name) validationIssues.push("Value set name required");
  if (draft.values.length < 3) validationIssues.push(`Need at least 3 values (have ${draft.values.length})`);
  if (draft.values.length > 7) validationIssues.push(`Maximum 7 values recommended (have ${draft.values.length})`);
  if (draft.values.some(v => !v.code || !v.name)) validationIssues.push("Some values have missing code/name");
  const valuesWithoutBehaviors = draft.values.filter(v => v.behaviors.filter(b => b.behavior).length === 0);
  if (valuesWithoutBehaviors.length > 0) validationIssues.push(`${valuesWithoutBehaviors.length} value(s) have no behaviors defined`);
  const canPublish = validationIssues.length === 0;

  // ── Step content ──
  function renderStep() {
    switch (currentStep) {
      case 0: return (
        <div className="space-y-4">
          <div><Label>Value Set Name</Label><Input value={draft.name} onChange={e => set("name", e.target.value)} placeholder="e.g. 2026 Core Values" /></div>
          <div><Label>Description</Label><Textarea value={draft.description} onChange={e => set("description", e.target.value)} placeholder="Purpose and context of this value set..." rows={4} /></div>
        </div>
      );

      case 1: return (
        <div className="space-y-4">
          {draft.values.length < 3 && <p className="text-sm text-amber-500">Define at least 3 values (have {draft.values.length})</p>}
          {draft.values.length >= 7 && <p className="text-sm text-amber-500">Maximum 7 values recommended</p>}
          {draft.values.map((v, vi) => (
            <Card key={vi}><CardContent className="pt-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">Code</Label><Input value={v.code} onChange={e => updateValue(vi, "code", e.target.value)} placeholder="INTEG" /></div>
                <div><Label className="text-xs">Name</Label><Input value={v.name} onChange={e => updateValue(vi, "name", e.target.value)} placeholder="Integrity" /></div>
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={v.type} onValueChange={val => updateValue(vi, "type", val)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="core">Core</SelectItem>
                      <SelectItem value="aspirational">Aspirational</SelectItem>
                      <SelectItem value="operational">Operational</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label className="text-xs">Description</Label><Textarea value={v.description} onChange={e => updateValue(vi, "description", e.target.value)} placeholder="What this value means..." rows={2} /></div>

              {/* Behaviors */}
              <div className="border-t pt-2">
                <div className="flex items-center justify-between mb-2"><Label className="text-xs">Behaviors ({v.behaviors.length})</Label><Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => addBehavior(vi)}>+ Add</Button></div>
                {v.behaviors.map((b, bi) => (
                  <div key={bi} className="flex gap-2 mb-1">
                    <Input value={b.behavior} onChange={e => updateBehavior(vi, bi, "behavior", e.target.value)} placeholder="Observable behavior..." className="flex-1 text-xs h-8" />
                    <Select value={b.level} onValueChange={val => updateBehavior(vi, bi, "level", val)}>
                      <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="exemplary">Exemplary</SelectItem>
                        <SelectItem value="minimum">Minimum</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => set("values", draft.values.filter((_, i) => i !== vi))}>Remove Value</Button>
            </CardContent></Card>
          ))}
          {draft.values.length < 7 && (
            <Button variant="outline" onClick={() => set("values", [...draft.values, emptyValue()])}><Heart className="w-4 h-4 mr-1" /> Add Value</Button>
          )}
        </div>
      );

      case 2: return (
        <div className="space-y-4">
          {draft.values.map((v, vi) => (
            <Card key={vi}><CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm">{v.name || `Value ${vi + 1}`}</h4>
                <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => addNonNeg(vi)}>+ Add</Button>
              </div>
              {v.nonNegotiables.map((nn, ni) => (
                <div key={ni} className="flex gap-2 mb-2">
                  <Input value={nn.description} onChange={e => updateNonNeg(vi, ni, "description", e.target.value)} placeholder="Red flag or anti-pattern..." className="flex-1 text-xs h-8" />
                  <Select value={nn.severity} onValueChange={val => updateNonNeg(vi, ni, "severity", val)}>
                    <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={nn.category} onValueChange={val => updateNonNeg(vi, ni, "category", val)}>
                    <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="red_flag">Red Flag</SelectItem>
                      <SelectItem value="anti_pattern">Anti-Pattern</SelectItem>
                      <SelectItem value="violation">Violation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
              {v.nonNegotiables.length === 0 && <p className="text-xs text-muted-foreground">No non-negotiables defined</p>}
            </CardContent></Card>
          ))}
          {draft.values.length === 0 && <p className="text-sm text-muted-foreground">Define values first (Step 2)</p>}
        </div>
      );

      case 3: return (
        <div className="space-y-4">
          {draft.values.map((v, vi) => (
            <Card key={vi}><CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm">{v.name || `Value ${vi + 1}`}</h4>
                <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => addTranslation(vi)}>+ Add Translation</Button>
              </div>
              {v.translations.map((t, ti) => (
                <div key={ti} className="grid grid-cols-3 gap-2 mb-2">
                  <Input value={t.unitType} onChange={e => updateTranslation(vi, ti, "unitType", e.target.value)} placeholder="Unit type (team, dept)" className="text-xs h-8" />
                  <Input value={t.unitIdentifier} onChange={e => updateTranslation(vi, ti, "unitIdentifier", e.target.value)} placeholder="Unit name" className="text-xs h-8" />
                  <Input value={t.translation} onChange={e => updateTranslation(vi, ti, "translation", e.target.value)} placeholder="How this value applies..." className="text-xs h-8" />
                </div>
              ))}
              {v.translations.length === 0 && <p className="text-xs text-muted-foreground">No translations defined</p>}
            </CardContent></Card>
          ))}
          {draft.values.length === 0 && <p className="text-sm text-muted-foreground">Define values first (Step 2)</p>}
        </div>
      );

      case 4: return (
        <div className="space-y-4">
          {draft.operationalization.map((op, i) => (
            <Card key={i}><CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={op.type} onValueChange={v => updateOps(i, "type", v)}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="review_criteria">Review Criteria</SelectItem>
                      <SelectItem value="onboarding_checklist">Onboarding Checklist</SelectItem>
                      <SelectItem value="bars_scale">BARS Scale</SelectItem>
                      <SelectItem value="survey_question">Survey Question</SelectItem>
                      <SelectItem value="recognition_criteria">Recognition Criteria</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Name</Label><Input value={op.name} onChange={e => updateOps(i, "name", e.target.value)} placeholder="Criteria name" /></div>
              </div>
              <div><Label className="text-xs">Description</Label><Textarea value={op.description} onChange={e => updateOps(i, "description", e.target.value)} placeholder="Details..." rows={2} /></div>
              <Button variant="ghost" size="sm" className="mt-2 text-xs text-destructive" onClick={() => set("operationalization", draft.operationalization.filter((_, k) => k !== i))}>Remove</Button>
            </CardContent></Card>
          ))}
          <Button variant="outline" onClick={addOps}><Cog className="w-4 h-4 mr-1" /> Add Template</Button>
        </div>
      );

      case 5: return (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Readiness Check</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {validationIssues.length === 0 ? (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <CheckCircle className="w-4 h-4" /> All checks passed — ready to publish
                </div>
              ) : (
                validationIssues.map((issue, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-amber-500">
                    <AlertTriangle className="w-4 h-4" /> {issue}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          {publishResult === "success" && (
            <div className="flex items-center gap-2 text-green-600 text-sm p-3 bg-green-500/10 rounded-lg">
              <CheckCircle className="w-4 h-4" /> Value set published successfully!
            </div>
          )}
          {publishResult && publishResult !== "success" && (
            <div className="flex items-center gap-2 text-destructive text-sm p-3 bg-destructive/10 rounded-lg">
              <XCircle className="w-4 h-4" /> {publishResult}
            </div>
          )}
        </div>
      );

      default: return null;
    }
  }

  // ── Preview panel ──
  const previewPanel = (
    <div className="space-y-3 text-sm">
      {draft.name && <div><span className="text-muted-foreground">Set:</span> {draft.name}</div>}
      {draft.values.length > 0 && (
        <div>
          <span className="text-muted-foreground">Values ({draft.values.length}/3–7):</span>
          {draft.values.filter(v => v.name).map((v, i) => (
            <div key={i} className="ml-2 text-xs flex items-center gap-1 mt-1">
              <Badge variant="outline" className="text-[10px] px-1">{v.type}</Badge>
              <span className="font-medium">{v.name}</span>
              <span className="text-muted-foreground">({v.behaviors.length} behaviors)</span>
            </div>
          ))}
        </div>
      )}
      {draft.values.some(v => v.nonNegotiables.length > 0) && (
        <div><span className="text-muted-foreground">Non-negotiables:</span> {draft.values.reduce((s, v) => s + v.nonNegotiables.length, 0)}</div>
      )}
      {draft.values.some(v => v.translations.length > 0) && (
        <div><span className="text-muted-foreground">Translations:</span> {draft.values.reduce((s, v) => s + v.translations.length, 0)}</div>
      )}
      {draft.operationalization.length > 0 && (
        <div><span className="text-muted-foreground">Ops Templates:</span> {draft.operationalization.length}</div>
      )}
    </div>
  );

  const totalBehaviors = draft.values.reduce((s, v) => s + v.behaviors.length, 0);
  const totalNonNegs = draft.values.reduce((s, v) => s + v.nonNegotiables.length, 0);
  const summaryBar = (
    <span>
      {draft.values.length} values, {totalBehaviors} behaviors, {totalNonNegs} non-negotiables, {draft.operationalization.length} ops templates
    </span>
  );

  return (
    <ModuleWizardShell
      title="Values Definition Wizard"
      accentColor="text-purple-500"
      steps={steps}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      previewPanel={previewPanel}
      summaryBar={summaryBar}
      isFinalStep={currentStep === 5}
      onPublish={handlePublish}
      canPublish={canPublish}
      isSaving={publishing}
    >
      {renderStep()}
    </ModuleWizardShell>
  );
}

export default CVWizardPage;
