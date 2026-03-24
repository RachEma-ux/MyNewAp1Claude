/**
 * HR Role Definition Edit Page — Create or edit a draft role definition
 *
 * Supports both creating new role definitions and editing existing draft versions.
 * Implements the structured template from the framework.
 */

import { useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Save, Plus, X } from "lucide-react";

function ArrayEditor({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  const [newItem, setNewItem] = useState("");
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="space-y-1">
        {value.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={item}
              onChange={(e) => {
                const updated = [...value];
                updated[i] = e.target.value;
                onChange(updated);
              }}
              className="text-sm"
            />
            <Button variant="ghost" size="sm" onClick={() => onChange(value.filter((_, idx) => idx !== i))}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder={`Add ${label.toLowerCase()}...`}
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newItem.trim()) {
              onChange([...value, newItem.trim()]);
              setNewItem("");
            }
          }}
          className="text-sm"
        />
        <Button variant="outline" size="sm" onClick={() => {
          if (newItem.trim()) { onChange([...value, newItem.trim()]); setNewItem(""); }
        }}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

export default function HRRoleDefinitionEditPage() {
  const [, editParams] = useRoute("/hr/role-definitions/:id/edit");
  const [, newParams] = useRoute("/hr/role-definitions/new");
  const [, navigate] = useLocation();
  const isNew = !!newParams || !editParams?.id;
  const roleDefId = isNew ? null : Number(editParams?.id);

  // Form state
  const [roleCode, setRoleCode] = useState("");
  const [title, setTitle] = useState("");
  const [purposeSummary, setPurposeSummary] = useState("");
  const [reportsToDescription, setReportsToDescription] = useState("");
  const [locationScope, setLocationScope] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [visibilityClass, setVisibilityClass] = useState("public_internal");
  const [changeType, setChangeType] = useState("material");
  const [changeReason, setChangeReason] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [nextReviewAt, setNextReviewAt] = useState("");
  const [accountabilities, setAccountabilities] = useState<string[]>([]);
  const [decisionRightsIndependent, setDecisionRightsIndependent] = useState<string[]>([]);
  const [decisionRightsRecommend, setDecisionRightsRecommend] = useState<string[]>([]);
  const [decisionRightsEscalate, setDecisionRightsEscalate] = useState<string[]>([]);
  const [boundariesInScope, setBoundariesInScope] = useState<string[]>([]);
  const [boundariesOutOfScope, setBoundariesOutOfScope] = useState<string[]>([]);
  const [collaborationInterfaces, setCollaborationInterfaces] = useState<string[]>([]);
  const [requiredTechnicalSkills, setRequiredTechnicalSkills] = useState<string[]>([]);
  const [requiredBehavioralSkills, setRequiredBehavioralSkills] = useState<string[]>([]);
  const [requiredEducation, setRequiredEducation] = useState<string[]>([]);
  const [requiredExperience, setRequiredExperience] = useState<string[]>([]);
  const [preferredQualifications, setPreferredQualifications] = useState<string[]>([]);
  const [successMetrics, setSuccessMetrics] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(isNew);

  // Load existing data for edit mode
  const roleDefQuery = trpc.hr.roleDefinitions.getById.useQuery(
    { id: roleDefId! },
    {
      enabled: !!roleDefId && !loaded,
      onSuccess: (data) => {
        if (data && data.currentVersion) {
          const v = data.currentVersion as any;
          setRoleCode(data.roleCode);
          setTitle(v.title || data.title);
          setPurposeSummary(v.purposeSummary || "");
          setReportsToDescription(v.reportsToDescription || "");
          setLocationScope(v.locationScope || "");
          setEmploymentType(v.employmentType || "");
          setVisibilityClass(v.visibilityClass || "public_internal");
          setChangeReason(v.changeReason || "");
          setChangeType(v.changeType || "material");
          setEffectiveFrom(v.effectiveFrom || "");
          setNextReviewAt(v.nextReviewAt || "");
          setAccountabilities(v.accountabilities || []);
          setDecisionRightsIndependent(v.decisionRightsIndependent || []);
          setDecisionRightsRecommend(v.decisionRightsRecommend || []);
          setDecisionRightsEscalate(v.decisionRightsEscalate || []);
          setBoundariesInScope(v.boundariesInScope || []);
          setBoundariesOutOfScope(v.boundariesOutOfScope || []);
          setCollaborationInterfaces(v.collaborationInterfaces || []);
          setRequiredTechnicalSkills(v.requiredTechnicalSkills || []);
          setRequiredBehavioralSkills(v.requiredBehavioralSkills || []);
          setRequiredEducation(v.requiredEducation || []);
          setRequiredExperience(v.requiredExperience || []);
          setPreferredQualifications(v.preferredQualifications || []);
          setSuccessMetrics(v.successMetrics || []);
          setLoaded(true);
        }
      },
    }
  );

  const createMutation = trpc.hr.roleDefinitions.createDraft.useMutation({
    onSuccess: (data) => navigate(`/hr/role-definitions/${data.roleDefinition.id}`),
  });
  const updateMutation = trpc.hr.roleDefinitions.updateDraft.useMutation({
    onSuccess: () => navigate(`/hr/role-definitions/${roleDefId}`),
  });

  const content = {
    title,
    purposeSummary: purposeSummary || undefined,
    reportsToDescription: reportsToDescription || undefined,
    locationScope: locationScope || undefined,
    employmentType: employmentType || undefined,
    visibilityClass: visibilityClass as any,
    changeType: changeType as any,
    changeReason: changeReason || undefined,
    effectiveFrom: effectiveFrom || undefined,
    nextReviewAt: nextReviewAt || undefined,
    accountabilities: accountabilities.length > 0 ? accountabilities : undefined,
    decisionRightsIndependent: decisionRightsIndependent.length > 0 ? decisionRightsIndependent : undefined,
    decisionRightsRecommend: decisionRightsRecommend.length > 0 ? decisionRightsRecommend : undefined,
    decisionRightsEscalate: decisionRightsEscalate.length > 0 ? decisionRightsEscalate : undefined,
    boundariesInScope: boundariesInScope.length > 0 ? boundariesInScope : undefined,
    boundariesOutOfScope: boundariesOutOfScope.length > 0 ? boundariesOutOfScope : undefined,
    collaborationInterfaces: collaborationInterfaces.length > 0 ? collaborationInterfaces : undefined,
    requiredTechnicalSkills: requiredTechnicalSkills.length > 0 ? requiredTechnicalSkills : undefined,
    requiredBehavioralSkills: requiredBehavioralSkills.length > 0 ? requiredBehavioralSkills : undefined,
    requiredEducation: requiredEducation.length > 0 ? requiredEducation : undefined,
    requiredExperience: requiredExperience.length > 0 ? requiredExperience : undefined,
    preferredQualifications: preferredQualifications.length > 0 ? preferredQualifications : undefined,
    successMetrics: successMetrics.length > 0 ? successMetrics : undefined,
  };

  const handleSave = () => {
    if (isNew) {
      createMutation.mutate({ roleCode, title, content });
    } else {
      const versionId = (roleDefQuery.data?.currentVersion as any)?.id;
      if (versionId) {
        updateMutation.mutate({ versionId, content });
      }
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
            <Link href="/hr"><a className="hover:text-foreground">HR</a></Link>
            <span className="mx-1">/</span>
            <Link href="/hr/role-definitions"><a className="hover:text-foreground">Role Definitions</a></Link>
            <span className="mx-1">/</span>
            <span className="text-foreground">{isNew ? "New" : "Edit"}</span>
          </nav>
          <h1 className="text-2xl font-bold">{isNew ? "New Role Definition" : "Edit Draft"}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={isNew ? "/hr/role-definitions" : `/hr/role-definitions/${roleDefId}`}>
            <Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Cancel</Button>
          </Link>
          <Button size="sm" onClick={handleSave} disabled={isSaving || !title || (isNew && !roleCode)}>
            <Save className="w-4 h-4 mr-1" /> {isSaving ? "Saving..." : "Save Draft"}
          </Button>
        </div>
      </div>

      {/* Role Identification */}
      <Card>
        <CardHeader><CardTitle>Role Identification</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {isNew && (
              <div>
                <Label>Role Code *</Label>
                <Input value={roleCode} onChange={(e) => setRoleCode(e.target.value)} placeholder="e.g. HR-GEN-001" />
              </div>
            )}
            <div className={isNew ? "" : "col-span-2"}>
              <Label>Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. HR Generalist" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Reports to</Label>
              <Input value={reportsToDescription} onChange={(e) => setReportsToDescription(e.target.value)} placeholder="e.g. HR Manager" />
            </div>
            <div>
              <Label>Location Scope</Label>
              <Input value={locationScope} onChange={(e) => setLocationScope(e.target.value)} placeholder="e.g. All offices" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Employment Type</Label>
              <Input value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} placeholder="e.g. Full-time" />
            </div>
            <div>
              <Label>Visibility Class</Label>
              <Select value={visibilityClass} onValueChange={setVisibilityClass}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public_internal">Public Internal</SelectItem>
                  <SelectItem value="team_visible">Team Visible</SelectItem>
                  <SelectItem value="manager_visible">Manager Visible</SelectItem>
                  <SelectItem value="hr_restricted">HR Restricted</SelectItem>
                  <SelectItem value="admin_restricted">Admin Restricted</SelectItem>
                  <SelectItem value="confidential_case">Confidential Case</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Change Type</Label>
              <Select value={changeType} onValueChange={setChangeType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minor_wording">Minor Wording</SelectItem>
                  <SelectItem value="material">Material</SelectItem>
                  <SelectItem value="structural">Structural</SelectItem>
                  <SelectItem value="visibility_change">Visibility Change</SelectItem>
                  <SelectItem value="retirement">Retirement</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Effective From</Label>
              <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
            <div>
              <Label>Next Review At</Label>
              <Input type="date" value={nextReviewAt} onChange={(e) => setNextReviewAt(e.target.value)} />
            </div>
            <div>
              <Label>Change Reason</Label>
              <Input value={changeReason} onChange={(e) => setChangeReason(e.target.value)} placeholder="Reason for this version" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Purpose */}
      <Card>
        <CardHeader><CardTitle>Role Purpose</CardTitle></CardHeader>
        <CardContent>
          <Textarea
            value={purposeSummary}
            onChange={(e) => setPurposeSummary(e.target.value)}
            placeholder="Why does this role exist? What organizational problem does it solve?"
            rows={4}
          />
        </CardContent>
      </Card>

      {/* Core Accountabilities */}
      <Card>
        <CardHeader><CardTitle>Core Accountabilities</CardTitle></CardHeader>
        <CardContent>
          <ArrayEditor label="Accountabilities" value={accountabilities} onChange={setAccountabilities} />
        </CardContent>
      </Card>

      {/* Decision Rights */}
      <Card>
        <CardHeader><CardTitle>Decision Rights</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ArrayEditor label="Can Decide Independently" value={decisionRightsIndependent} onChange={setDecisionRightsIndependent} />
          <ArrayEditor label="Can Recommend" value={decisionRightsRecommend} onChange={setDecisionRightsRecommend} />
          <ArrayEditor label="Requires Escalation" value={decisionRightsEscalate} onChange={setDecisionRightsEscalate} />
        </CardContent>
      </Card>

      {/* Boundaries */}
      <Card>
        <CardHeader><CardTitle>Boundaries & Exclusions</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ArrayEditor label="In Scope" value={boundariesInScope} onChange={setBoundariesInScope} />
          <ArrayEditor label="Out of Scope" value={boundariesOutOfScope} onChange={setBoundariesOutOfScope} />
        </CardContent>
      </Card>

      {/* Collaboration */}
      <Card>
        <CardHeader><CardTitle>Collaboration Interfaces</CardTitle></CardHeader>
        <CardContent>
          <ArrayEditor label="Interfaces" value={collaborationInterfaces} onChange={setCollaborationInterfaces} />
        </CardContent>
      </Card>

      {/* Requirements */}
      <Card>
        <CardHeader><CardTitle>Competencies & Requirements</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ArrayEditor label="Required Technical Skills" value={requiredTechnicalSkills} onChange={setRequiredTechnicalSkills} />
          <ArrayEditor label="Required Behavioral Skills" value={requiredBehavioralSkills} onChange={setRequiredBehavioralSkills} />
          <ArrayEditor label="Required Education" value={requiredEducation} onChange={setRequiredEducation} />
          <ArrayEditor label="Required Experience" value={requiredExperience} onChange={setRequiredExperience} />
          <ArrayEditor label="Preferred Qualifications" value={preferredQualifications} onChange={setPreferredQualifications} />
        </CardContent>
      </Card>

      {/* Success Metrics */}
      <Card>
        <CardHeader><CardTitle>Success Metrics</CardTitle></CardHeader>
        <CardContent>
          <ArrayEditor label="Metrics" value={successMetrics} onChange={setSuccessMetrics} />
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end gap-2">
        <Link href={isNew ? "/hr/role-definitions" : `/hr/role-definitions/${roleDefId}`}>
          <Button variant="outline">Cancel</Button>
        </Link>
        <Button onClick={handleSave} disabled={isSaving || !title || (isNew && !roleCode)}>
          <Save className="w-4 h-4 mr-1" /> {isSaving ? "Saving..." : "Save Draft"}
        </Button>
      </div>
    </div>
  );
}
