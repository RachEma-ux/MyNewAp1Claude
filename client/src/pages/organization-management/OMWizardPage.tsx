/**
 * OM Wizard — 8-step matrix-driven organizational structure setup wizard
 *
 * Steps:
 * 1. Structure Version Context — name, description
 * 2. Legal Entity Setup — entity type, legal structure, tax election, state
 * 3. Alignment Matrix — select structure type, auto-populate attributes
 * 4. Type-Specific Build — org units with type-aware guidance
 * 5. Jobs — define job families and roles
 * 6. Positions — create positions linked to org units & jobs
 * 7. Reporting & Authority — reporting lines
 * 8. Validation & Publish — readiness check and publish
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
  Building2, Network, Users, Briefcase, GitBranch, CheckCircle, XCircle, AlertTriangle, Layers,
} from "lucide-react";
import { AlignmentMatrixStep } from "@/components/organization-management/AlignmentMatrixStep";
import { TypeSpecificBuildSection } from "@/components/organization-management/TypeSpecificBuildSection";

interface WizardDraft {
  // Step 1 — Structure Context
  versionName: string;
  versionDescription: string;
  // Step 2 — Legal Entity
  legalEntityCode: string;
  legalEntityName: string;
  legalEntityType: "company" | "subsidiary" | "branch" | "holding";
  legalStructure: string;
  taxElection: string;
  incorporationState: string;
  // Step 3 — Alignment Matrix (tracked here for validation)
  structureModel: string;
  selectedTypeId: number | null;
  // Step 4 — Org Units
  orgUnits: { code: string; name: string; type: string; parentIndex?: number }[];
  // Step 5 — Jobs
  jobs: { code: string; title: string; family: string; level: string }[];
  // Step 6 — Positions
  positions: { code: string; title: string; jobIndex?: number; orgUnitIndex?: number }[];
  // Step 7 — Reporting
  reportingLines: { positionIndex: number; reportsToIndex: number; type: string }[];
}

const EMPTY_DRAFT: WizardDraft = {
  versionName: "", versionDescription: "",
  legalEntityCode: "", legalEntityName: "", legalEntityType: "company",
  legalStructure: "", taxElection: "", incorporationState: "",
  structureModel: "", selectedTypeId: null,
  orgUnits: [], jobs: [], positions: [], reportingLines: [],
};

// We create the structure version early (step 1) so subsequent steps can reference it
export function OMWizardPage({ workspaceId }: { workspaceId: number }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [draft, setDraft] = useState<WizardDraft>({ ...EMPTY_DRAFT });
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);
  const [structureVersionId, setStructureVersionId] = useState<number | null>(null);

  const createEntity = trpc.organizationManagement.legalEntities.create.useMutation();
  const createOrgUnit = trpc.organizationManagement.orgUnits.create.useMutation();
  const createJob = trpc.organizationManagement.jobs.create.useMutation();
  const createPosition = trpc.organizationManagement.positions.create.useMutation();
  const createReporting = trpc.organizationManagement.reporting.create.useMutation();
  const createVersion = trpc.organizationManagement.structureVersions.create.useMutation();
  const publishVersion = trpc.organizationManagement.structureVersions.publish.useMutation();

  const steps: WizardStep[] = [
    { id: "context", label: "Structure Version", description: "Name your structure version", isValid: !!draft.versionName },
    { id: "legal-entity", label: "Legal Entity", description: "Define the primary legal entity", isValid: !!draft.legalEntityCode && !!draft.legalEntityName },
    { id: "alignment", label: "Alignment Matrix", description: "Select structure type from the matrix", isValid: !!draft.structureModel },
    { id: "build", label: "Org Units", description: "Build structure-specific org units", isValid: draft.orgUnits.length > 0 },
    { id: "jobs", label: "Jobs", description: "Define job families and role levels", isValid: draft.jobs.length > 0 },
    { id: "positions", label: "Positions", description: "Create positions linked to org units & jobs", isValid: draft.positions.length > 0 },
    { id: "reporting", label: "Reporting & Authority", description: "Define reporting lines", isValid: draft.reportingLines.length > 0 || draft.positions.length <= 1 },
    { id: "publish", label: "Validation & Publish", description: "Review and publish", isValid: false },
  ];

  const set = <K extends keyof WizardDraft>(key: K, val: WizardDraft[K]) =>
    setDraft(d => ({ ...d, [key]: val }));

  // Create structure version when leaving step 1 (if not created yet)
  async function ensureStructureVersion() {
    if (structureVersionId) return structureVersionId;
    if (!draft.versionName) return null;
    try {
      const version = await createVersion.mutateAsync({
        workspaceId, name: draft.versionName, description: draft.versionDescription,
      });
      setStructureVersionId(version.id);
      return version.id;
    } catch (err: any) {
      console.warn("Failed to create structure version:", err.message);
      return null;
    }
  }

  // Handle step change — auto-create version on step 1→2
  async function handleStepChange(step: number) {
    if (currentStep === 0 && step > 0 && !structureVersionId) {
      await ensureStructureVersion();
    }
    setCurrentStep(step);
  }

  function handleTypeSelected(typeCode: string, typeId: number) {
    set("structureModel", typeCode);
    setDraft(d => ({ ...d, structureModel: typeCode, selectedTypeId: typeId }));
  }

  // ── Inline item adders ──
  function addJob() {
    set("jobs", [...draft.jobs, { code: "", title: "", family: "", level: "" }]);
  }
  function addPosition() {
    set("positions", [...draft.positions, { code: "", title: "" }]);
  }
  function addReportingLine() {
    if (draft.positions.length < 2) return;
    set("reportingLines", [...draft.reportingLines, { positionIndex: 1, reportsToIndex: 0, type: "direct" }]);
  }

  function updateJob(i: number, field: string, val: string) {
    const next = [...draft.jobs];
    next[i] = { ...next[i], [field]: val };
    set("jobs", next);
  }
  function updatePosition(i: number, field: string, val: string | number | undefined) {
    const next = [...draft.positions];
    next[i] = { ...next[i], [field]: val };
    set("positions", next);
  }
  function updateReporting(i: number, field: string, val: number | string) {
    const next = [...draft.reportingLines];
    next[i] = { ...next[i], [field]: val };
    set("reportingLines", next);
  }

  // ── Publish Flow ──
  async function handlePublish() {
    setPublishing(true);
    setPublishResult(null);
    try {
      // 1. Create legal entity
      const entity = await createEntity.mutateAsync({
        workspaceId, code: draft.legalEntityCode, name: draft.legalEntityName, type: draft.legalEntityType,
      });

      // 2. Create org units (sequential for parent refs)
      const orgUnitIds: number[] = [];
      for (const u of draft.orgUnits) {
        const created = await createOrgUnit.mutateAsync({
          workspaceId, code: u.code, name: u.name, type: u.type as any,
          parentOrgUnitId: u.parentIndex != null ? orgUnitIds[u.parentIndex] : undefined,
          legalEntityId: entity.id,
          metadata: { structureModel: draft.structureModel },
        });
        orgUnitIds.push(created.id);
      }

      // 3. Create jobs
      const jobIds: number[] = [];
      for (const j of draft.jobs) {
        const created = await createJob.mutateAsync({
          workspaceId, code: j.code, title: j.title, family: j.family || undefined, level: j.level || undefined,
        });
        jobIds.push(created.id);
      }

      // 4. Create positions
      const positionIds: number[] = [];
      for (const p of draft.positions) {
        const created = await createPosition.mutateAsync({
          workspaceId, positionCode: p.code, title: p.title,
          jobId: p.jobIndex != null ? jobIds[p.jobIndex] : undefined,
          orgUnitId: p.orgUnitIndex != null ? orgUnitIds[p.orgUnitIndex] : undefined,
          legalEntityId: entity.id,
        });
        positionIds.push(created.id);
      }

      // 5. Create reporting relationships
      for (const r of draft.reportingLines) {
        await createReporting.mutateAsync({
          workspaceId,
          positionId: positionIds[r.positionIndex],
          reportsToPositionId: positionIds[r.reportsToIndex],
          type: r.type as any,
        });
      }

      // 6. Publish the structure version
      const vId = structureVersionId ?? (await ensureStructureVersion());
      if (vId) {
        await publishVersion.mutateAsync({ workspaceId, id: vId });
      }

      setPublishResult("success");
    } catch (err: any) {
      setPublishResult(err.message || "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  // ── Validation summary ──
  const validationIssues: string[] = [];
  if (!draft.versionName) validationIssues.push("Structure version name required");
  if (!draft.legalEntityCode || !draft.legalEntityName) validationIssues.push("Legal entity required");
  if (!draft.structureModel) validationIssues.push("Structure type not selected from matrix");
  if (draft.orgUnits.length === 0) validationIssues.push("No org units defined");
  if (draft.orgUnits.some(u => !u.code || !u.name)) validationIssues.push("Some org units have missing code/name");
  if (draft.jobs.length === 0) validationIssues.push("No jobs defined");
  if (draft.jobs.some(j => !j.code || !j.title)) validationIssues.push("Some jobs have missing code/title");
  if (draft.positions.length === 0) validationIssues.push("No positions defined");
  if (draft.positions.some(p => !p.code || !p.title)) validationIssues.push("Some positions have missing code/title");
  const canPublish = validationIssues.length === 0;

  // ── Step content ──
  function renderStep() {
    switch (currentStep) {
      // Step 1: Structure Version Context
      case 0: return (
        <div className="space-y-4">
          <div><Label>Version Name</Label><Input value={draft.versionName} onChange={e => set("versionName", e.target.value)} placeholder="e.g. Q1 2026 Structure" /></div>
          <div><Label>Version Description</Label><Textarea value={draft.versionDescription} onChange={e => set("versionDescription", e.target.value)} placeholder="What this version represents..." rows={3} /></div>
        </div>
      );

      // Step 2: Legal Entity Setup
      case 1: return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Entity Code</Label><Input value={draft.legalEntityCode} onChange={e => set("legalEntityCode", e.target.value)} placeholder="CORP-001" /></div>
            <div><Label>Entity Name</Label><Input value={draft.legalEntityName} onChange={e => set("legalEntityName", e.target.value)} placeholder="Acme Corp" /></div>
          </div>
          <div>
            <Label>Entity Type</Label>
            <Select value={draft.legalEntityType} onValueChange={v => set("legalEntityType", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="company">Company</SelectItem>
                <SelectItem value="subsidiary">Subsidiary</SelectItem>
                <SelectItem value="branch">Branch</SelectItem>
                <SelectItem value="holding">Holding</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Legal Structure</Label>
            <Select value={draft.legalStructure} onValueChange={v => set("legalStructure", v)}>
              <SelectTrigger><SelectValue placeholder="Select legal structure..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LLC">LLC</SelectItem>
                <SelectItem value="S-Corp">S-Corp</SelectItem>
                <SelectItem value="C-Corp">C-Corp</SelectItem>
                <SelectItem value="C-Corp (Delaware)">C-Corp (Delaware)</SelectItem>
                <SelectItem value="Partnership">Partnership</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tax Election</Label>
              <Input value={draft.taxElection} onChange={e => set("taxElection", e.target.value)} placeholder="e.g. Pass-through, C-Corp" />
            </div>
            <div>
              <Label>Incorporation State</Label>
              <Input value={draft.incorporationState} onChange={e => set("incorporationState", e.target.value)} placeholder="e.g. Delaware, California" />
            </div>
          </div>
        </div>
      );

      // Step 3: Alignment Matrix
      case 2: return (
        <AlignmentMatrixStep
          workspaceId={workspaceId}
          structureVersionId={structureVersionId}
          selectedTypeCode={draft.structureModel}
          onTypeSelected={handleTypeSelected}
        />
      );

      // Step 4: Type-Specific Build (Org Units)
      case 3: return (
        <TypeSpecificBuildSection
          structureType={draft.structureModel || null}
          orgUnits={draft.orgUnits}
          onOrgUnitsChange={units => set("orgUnits", units)}
        />
      );

      // Step 5: Jobs
      case 4: return (
        <div className="space-y-4">
          {draft.jobs.map((j, i) => (
            <Card key={i}><CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div><Label className="text-xs">Code</Label><Input value={j.code} onChange={e => updateJob(i, "code", e.target.value)} placeholder="JOB-001" /></div>
                <div><Label className="text-xs">Title</Label><Input value={j.title} onChange={e => updateJob(i, "title", e.target.value)} placeholder="Software Engineer" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Family</Label><Input value={j.family} onChange={e => updateJob(i, "family", e.target.value)} placeholder="Engineering" /></div>
                <div><Label className="text-xs">Level</Label><Input value={j.level} onChange={e => updateJob(i, "level", e.target.value)} placeholder="IC3" /></div>
              </div>
              <Button variant="ghost" size="sm" className="mt-2 text-xs text-destructive" onClick={() => set("jobs", draft.jobs.filter((_, k) => k !== i))}>Remove</Button>
            </CardContent></Card>
          ))}
          <Button variant="outline" onClick={addJob}><Briefcase className="w-4 h-4 mr-1" /> Add Job</Button>
        </div>
      );

      // Step 6: Positions
      case 5: return (
        <div className="space-y-4">
          {draft.positions.map((p, i) => (
            <Card key={i}><CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div><Label className="text-xs">Position Code</Label><Input value={p.code} onChange={e => updatePosition(i, "code", e.target.value)} placeholder="POS-001" /></div>
                <div><Label className="text-xs">Title</Label><Input value={p.title} onChange={e => updatePosition(i, "title", e.target.value)} placeholder="Lead Engineer" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {draft.orgUnits.length > 0 && (
                  <div>
                    <Label className="text-xs">Org Unit</Label>
                    <Select value={p.orgUnitIndex?.toString() ?? ""} onValueChange={v => updatePosition(i, "orgUnitIndex", v ? parseInt(v) : undefined)}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {draft.orgUnits.map((u, ui) => (
                          <SelectItem key={ui} value={ui.toString()}>{u.name || `Unit ${ui + 1}`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {draft.jobs.length > 0 && (
                  <div>
                    <Label className="text-xs">Job</Label>
                    <Select value={p.jobIndex?.toString() ?? ""} onValueChange={v => updatePosition(i, "jobIndex", v ? parseInt(v) : undefined)}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {draft.jobs.map((j, ji) => (
                          <SelectItem key={ji} value={ji.toString()}>{j.title || `Job ${ji + 1}`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <Button variant="ghost" size="sm" className="mt-2 text-xs text-destructive" onClick={() => set("positions", draft.positions.filter((_, k) => k !== i))}>Remove</Button>
            </CardContent></Card>
          ))}
          <Button variant="outline" onClick={addPosition}><Users className="w-4 h-4 mr-1" /> Add Position</Button>
        </div>
      );

      // Step 7: Reporting & Authority
      case 6: return (
        <div className="space-y-4">
          {draft.reportingLines.map((r, i) => (
            <Card key={i}><CardContent className="pt-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Position</Label>
                  <Select value={r.positionIndex.toString()} onValueChange={v => updateReporting(i, "positionIndex", parseInt(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {draft.positions.map((p, pi) => (
                        <SelectItem key={pi} value={pi.toString()}>{p.title || `Pos ${pi + 1}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Reports To</Label>
                  <Select value={r.reportsToIndex.toString()} onValueChange={v => updateReporting(i, "reportsToIndex", parseInt(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {draft.positions.map((p, pi) => (
                        <SelectItem key={pi} value={pi.toString()}>{p.title || `Pos ${pi + 1}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={r.type} onValueChange={v => updateReporting(i, "type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct">Direct</SelectItem>
                      <SelectItem value="dotted">Dotted</SelectItem>
                      <SelectItem value="functional">Functional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="mt-2 text-xs text-destructive" onClick={() => set("reportingLines", draft.reportingLines.filter((_, k) => k !== i))}>Remove</Button>
            </CardContent></Card>
          ))}
          {draft.positions.length >= 2 ? (
            <Button variant="outline" onClick={addReportingLine}><GitBranch className="w-4 h-4 mr-1" /> Add Reporting Line</Button>
          ) : (
            <p className="text-sm text-muted-foreground">Add at least 2 positions first</p>
          )}
        </div>
      );

      // Step 8: Validation & Publish
      case 7: return (
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

          {/* Structure summary */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Structure Summary</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Version</span><span>{draft.versionName || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Legal Entity</span><span>{draft.legalEntityName || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Structure Type</span><Badge variant="outline" className="text-xs">{draft.structureModel || "—"}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Org Units</span><span>{draft.orgUnits.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Jobs</span><span>{draft.jobs.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Positions</span><span>{draft.positions.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Reporting Lines</span><span>{draft.reportingLines.length}</span></div>
            </CardContent>
          </Card>

          {publishResult === "success" && (
            <div className="flex items-center gap-2 text-green-600 text-sm p-3 bg-green-500/10 rounded-lg">
              <CheckCircle className="w-4 h-4" /> Structure published successfully!
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
      {draft.versionName && <div><span className="text-muted-foreground">Version:</span> {draft.versionName}</div>}
      {draft.legalEntityName && <div><span className="text-muted-foreground">Entity:</span> {draft.legalEntityName}</div>}
      {draft.legalStructure && <div><span className="text-muted-foreground">Legal:</span> {draft.legalStructure}</div>}
      {draft.structureModel && <div><span className="text-muted-foreground">Type:</span> <Badge variant="outline" className="text-xs">{draft.structureModel}</Badge></div>}
      {draft.orgUnits.length > 0 && (
        <div>
          <span className="text-muted-foreground">Org Units ({draft.orgUnits.length}):</span>
          {draft.orgUnits.filter(u => u.name).map((u, i) => (
            <div key={i} className="ml-2 text-xs">{u.name} <span className="text-muted-foreground">({u.type})</span></div>
          ))}
        </div>
      )}
      {draft.jobs.length > 0 && (
        <div>
          <span className="text-muted-foreground">Jobs ({draft.jobs.length}):</span>
          {draft.jobs.filter(j => j.title).map((j, i) => (
            <div key={i} className="ml-2 text-xs">{j.title} {j.family && <span className="text-muted-foreground">— {j.family}</span>}</div>
          ))}
        </div>
      )}
      {draft.positions.length > 0 && (
        <div>
          <span className="text-muted-foreground">Positions ({draft.positions.length}):</span>
          {draft.positions.filter(p => p.title).map((p, i) => (
            <div key={i} className="ml-2 text-xs">{p.title}</div>
          ))}
        </div>
      )}
      {draft.reportingLines.length > 0 && (
        <div><span className="text-muted-foreground">Reporting Lines:</span> {draft.reportingLines.length}</div>
      )}
    </div>
  );

  const summaryBar = (
    <span>
      {draft.orgUnits.length} org units, {draft.jobs.length} jobs, {draft.positions.length} positions, {draft.reportingLines.length} reporting lines
    </span>
  );

  return (
    <ModuleWizardShell
      title="OM Structure Wizard"
      accentColor="text-blue-500"
      steps={steps}
      currentStep={currentStep}
      onStepChange={handleStepChange}
      previewPanel={previewPanel}
      summaryBar={summaryBar}
      isFinalStep={currentStep === 7}
      onPublish={handlePublish}
      canPublish={canPublish}
      isSaving={publishing}
    >
      {renderStep()}
    </ModuleWizardShell>
  );
}

export default OMWizardPage;
